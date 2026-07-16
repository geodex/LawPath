// server/legal-grounding.js
// Stops the assistant inventing case law.
//
// WHY THIS EXISTS
// A testing attorney asked the chat assistant what the courts had decided in a
// bank-fraud scenario. The assistant answered from the model's training weights
// with no retrieval at all, and produced citations that either did not exist or
// welded a real case name onto unrelated facts. He checked one on SAFLII, found
// it was about something else entirely, and stopped using the tool. His words:
// "I lost a little bit of faith."
//
// That is the correct reaction, and it is fatal for a legal research product. A
// practitioner who must verify every citation externally is worse off than with
// no tool at all. An LLM cannot be trusted to recall South African citations —
// there are too few in its training data and the format is easy to confabulate.
//
// THE APPROACH — two layers, because either alone is insufficient:
//   1. GROUND: retrieve real judgments from the firm's corpus and give them to
//      the model as the only permitted source.
//   2. VERIFY: whatever the model writes, extract every citation from its answer
//      and check it against the corpus. Anything we cannot verify is reported as
//      unverified — loudly — rather than presented as fact.
//
// Layer 2 matters most. Prompt instructions are a request; verification is a
// check. We never silently trust the model's output.

const { pool } = require("./db");

// South African citation forms:
//   neutral      [2019] ZASCA 12   ·   [2021] ZAGPJHC 45   ·   [2020] ZACC 3
//   law reports  2019 (2) SA 343 (SCA)   ·   1998 (1) BCLR 1 (CC)
const CITATION_PATTERNS = [
  /\[\s*\d{4}\s*\]\s*ZA[A-Z]{2,12}\s*\d+/g,
  /\b\d{4}\s*\(\s*\d+\s*\)\s*(?:SA|BCLR|All\s+SA|SACR)\s+\d+\s*\(\s*[A-Za-z]{1,6}\s*\)/g
];

const normalise = (c) => String(c).replace(/\s+/g, " ").trim();

// Pull every citation-shaped string out of a block of prose.
function extractCitations(text) {
  if (!text) return [];
  const found = new Set();
  for (const re of CITATION_PATTERNS) {
    for (const m of String(text).matchAll(re)) found.add(normalise(m[0]));
  }
  return [...found];
}

// Check each citation against the corpus. Unverified != fabricated — the corpus
// may simply not hold that judgment — so the wording downstream says exactly
// that rather than accusing the model of lying.
async function verifyCitations(citations) {
  if (!citations.length) return [];
  const out = [];
  for (const c of citations) {
    try {
      const r = await pool.query(
        `select title, citation, court, source_url, year
           from legal_corpus_documents
          where citation ilike $1 or title ilike $1
          limit 1`,
        [`%${c}%`]
      );
      const doc = r.rows[0];
      out.push({
        citation: c,
        verified: !!doc,
        title: doc?.title || null,
        court: doc?.court || null,
        year: doc?.year || null,
        sourceUrl: doc?.source_url || null
      });
    } catch {
      out.push({ citation: c, verified: false, title: null, court: null, year: null, sourceUrl: null });
    }
  }
  return out;
}

// The courts a litigator actually relies on. Feedback from a practising attorney:
// "I'm mainly interested in Supreme Court of Appeal and High Court judgments.
// The Constitutional Court only really comes up when there's a constitutional
// issue." So SCA/HC are preferred by default rather than everything equally.
const PREFERRED_COURT_PATTERNS = ["%SCA%", "%Supreme Court of Appeal%", "%High Court%", "%ZAGP%", "%ZAWCHC%", "%ZAKZ%", "%ZAFS%", "%ZAEC%", "%ZANC%", "%ZALM%", "%ZAMP%", "%ZANW%"];

/**
 * Retrieve real judgments for a question, to hand the model as its only source.
 * Uses the corpus's full-text index, preferring the courts practitioners cite.
 * Returns [] when nothing matches — and an empty result must lead to the
 * assistant saying it has no authority, never to it inventing some.
 */
async function retrieveCorpusContext({ query, limit = 6, preferSuperiorCourts = true }) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];
  try {
    const r = await pool.query(
      `select id, frbr_uri, title, citation, court, year, decision_date, summary, full_text_snippet, source_url,
              ts_rank(
                to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(full_text_snippet,'')),
                plainto_tsquery('english', $1)
              ) as rank,
              case when ${preferSuperiorCourts ? `court ilike any($3::text[])` : "false"} then 1 else 0 end as preferred
         from legal_corpus_documents
        where to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(full_text_snippet,''))
              @@ plainto_tsquery('english', $1)
        order by preferred desc, rank desc
        limit $2`,
      [q, limit, PREFERRED_COURT_PATTERNS]
    );
    return r.rows;
  } catch (err) {
    console.warn("[grounding] corpus retrieval failed:", err.message);
    return [];
  }
}

/**
 * The retrieval the chat should actually use: local corpus + live Knowledge
 * Base, merged.
 *
 * WHY BOTH: the local corpus only holds what past indexer runs and past
 * research happened to cache. The attorney's own words are the best KB query
 * that will ever exist for his question, so they go to Laws.Africa live — and
 * every identified result is cached through the indexer's own upsert on the
 * way past, so the corpus grows around what the firm actually researches.
 *
 * Order of the merge, most-trustworthy first:
 *   1. An exact citation lookup, when the query contains a citation shape.
 *      Filtered by work_frbr_uri, verified against the requested URI — the
 *      "pasted a citation, got an unrelated case" failure cannot happen here.
 *   2. Live semantic results (Laws.Africa's ranking, fresher than our FTS).
 *   3. Local FTS results not already present (the curated seeds live here).
 *
 * Budget spend per chat message: ONE live call — the citation lookup when the
 * query contains a citation, the semantic retrieve otherwise. Never both.
 *
 * Degrades to local-only whenever live retrieval cannot run (no key, daily
 * budget spent, API down): identical behaviour to before this function
 * existed. Grounding must never be less available than it was.
 */
async function retrieveGroundingSources({ query, limit = 6 }) {
  // Required lazily so a broken live module can never take grounding down.
  let live = null;
  try { live = require("./live-research"); } catch { /* local-only */ }

  const docs = [];
  const seen = new Set();
  const push = (d) => {
    // Citation first: it is the judgment's legal identity and both the live
    // and local shapes carry it, so the same case arriving via both routes
    // collapses onto one entry even if one side lacks the FRBR URI.
    const key = d.citation || d.frbr_uri || `${d.title}|${d.year}`;
    if (seen.has(key)) return;
    seen.add(key);
    docs.push(d);
  };

  let liveUsed = false;
  if (live) {
    const cited = live.extractCitationShape(query);
    if (cited) {
      const exact = await live.lookupByCitation(cited);
      liveUsed = true;
      if (exact) push(exact);
    } else {
      const r = await live.retrieveLive({ query, topK: Math.max(limit, 10) });
      liveUsed = r.live;
      for (const d of r.docs.slice(0, limit)) push(d);
    }
  }

  for (const d of await retrieveCorpusContext({ query, limit })) push(d);

  return { docs: docs.slice(0, limit), liveUsed };
}

// Render retrieved judgments as the model's SOURCES block.
function formatSources(docs) {
  if (!docs.length) return "";
  return docs.map((d, i) => [
    `[S${i + 1}] ${d.title || "Untitled"}`,
    d.citation ? `    Citation: ${d.citation}` : null,
    d.court ? `    Court: ${d.court}${d.year ? ` (${d.year})` : ""}` : null,
    d.summary ? `    Summary: ${String(d.summary).slice(0, 600)}` : null,
    d.full_text_snippet ? `    Extract: ${String(d.full_text_snippet).slice(0, 900)}` : null
  ].filter(Boolean).join("\n")).join("\n\n");
}

// Resolve [S#] tags into the authorities they name. The grounding instruction
// teaches the model to reference [S#] tags — right for chat, where the UI
// resolves each tag into a source card, but meaningless in a standalone
// document: the first drafted opinion in production cited exclusively "[S1]",
// "[S2]", "[S3]", so it carried no citation a reader could look up and its
// SCHEDULE OF AUTHORITIES came out empty. The tag numbering is ours
// (formatSources), so the substitution is mechanical, not model-dependent:
//   first mention  ->  "Title [2024] ZASCA 90"
//   repeats        ->  "[2024] ZASCA 90"
//   tag adjacent to its own citation -> dropped (avoid "…ZASCA 90 [S1]" dupes)
//   tag with no matching source, or a source with no citation -> dropped; the
//   claim it decorated is then caught by the draft's re-verification pass.
function resolveSourceTags(text, sources) {
  const mentioned = new Set();
  return String(text || "").replace(/\s*\[S(\d+)\]/g, (tag, nStr, offset, whole) => {
    const src = sources[parseInt(nStr, 10) - 1];
    if (!src || !src.citation) return "";
    const before = normalise(whole.slice(Math.max(0, offset - 220), offset));
    if (before.includes(normalise(src.citation))) return "";
    const first = !mentioned.has(src.citation);
    mentioned.add(src.citation);
    return ` ${first && src.title ? `${src.title} ${src.citation}` : src.citation}`;
  });
}

// The instruction block. Blunt on purpose: a hedged instruction gets hedged
// compliance, and the failure mode here ends careers.
function groundingInstruction(hasSources) {
  return [
    "SOUTH AFRICAN LEGAL AUTHORITY — ABSOLUTE RULES:",
    "1. NEVER cite a case, judgment or citation that is not listed in SOURCES below. Not one.",
    "2. Your training data is NOT a reliable source of South African citations. You will confabulate plausible-looking case names and citations that do not exist, or attach a real name to facts from another case. Do not attempt recall.",
    "3. If SOURCES does not answer the question, say so plainly: state the applicable legal principles WITHOUT citing authority, and tell the user to run a corpus search or check SAFLII. That is a useful answer. An invented citation is a professional hazard.",
    "4. When you rely on a source, cite it exactly as written in SOURCES and reference its [S#] tag.",
    "5. You may state general legal principles from your own knowledge — but principles only, never case names, citations or holdings attributed to a specific judgment.",
    hasSources
      ? "SOURCES (the ONLY authority you may cite):"
      : "SOURCES: none — the firm's corpus returned no matching judgment. You therefore may not cite ANY case. Give the principles and recommend a search."
  ].join("\n");
}

module.exports = {
  extractCitations, verifyCitations, retrieveCorpusContext, retrieveGroundingSources,
  formatSources, groundingInstruction, resolveSourceTags, PREFERRED_COURT_PATTERNS
};
