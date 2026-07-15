// server/live-research.js
// Live Knowledge Base retrieval at research time, with a shared daily budget.
//
// WHY: the nightly indexer runs canned topic queries and hopes they anticipate
// what an attorney will ask. They never anticipated "bank's duty when an
// invoice is intercepted". The attorney's own words are the best KB query that
// will ever exist for his question — so research sends THEM to the KB, live,
// and caches every identified result through the same upsert the indexer uses
// (indexResult: identity from metadata.work_frbr_uri, deduped, thin rows
// upgraded in place). The corpus grows around what the firm actually
// researches, one call per question. Storing retrieved data was cleared
// verbally with Laws.Africa's technical manager at project start.
//
// BUDGET: the Sandbox plan allows 100 calls/day shared between the indexer
// batch and live research. Every call is metered in laws_africa_usage_log
// (033) and this module refuses to place one once today's count reaches
// LAWS_AFRICA_DAILY_CAP (default 90 — headroom for clock skew between our
// day boundary and theirs). Research NEVER hard-fails on budget: callers get
// { live: false, reason } and fall back to the local corpus.
//
// EXACT CITATION LOOKUP: the retrieve API accepts a work_frbr_uri filter, and
// a neutral citation is the same fact as a work URI in another notation
// ([2016] ZASCA 195 <-> /akn/za/judgment/zasca/2016/195). So a pasted citation
// becomes an exact lookup of precisely that judgment — the "pasted a citation,
// got an unrelated case" failure cannot happen on this path.

require("dotenv").config();

const { pool } = require("./db");
const { queryKnowledgeBase, indexResult, resolveIdentity } = require("./saflii");
const { frbrUriFromCitation } = require("./corpus-frbr-backfill");

const KB_CODE = "judgments-za";
const DAILY_CAP = Math.max(0, parseInt(process.env.LAWS_AFRICA_DAILY_CAP || "90", 10) || 90);

async function callsUsedToday() {
  const { rows: [r] } = await pool.query(
    "select count(*)::int as n from laws_africa_usage_log where created_at >= date_trunc('day', now())"
  );
  return r.n;
}

async function budgetRemaining() {
  return Math.max(0, DAILY_CAP - (await callsUsedToday()));
}

// Corpus-row shape, so grounding's formatSources and the research UI can treat
// live results exactly like local ones.
function docFromIdentity(d) {
  return {
    frbr_uri: d.frbrUri,
    title: d.title,
    citation: d.citation,
    court: d.court,
    year: d.year,
    decision_date: d.decisionDate,
    summary: d.summary,
    full_text_snippet: d.fullText,
    source_url: d.sourceUrl,
    tags: d.tags,
    live: true
  };
}

/**
 * One live KB call. Returns
 *   { live: true,  docs, results, newDocs, upgraded }        on success
 *   { live: false, docs: [], reason: 'no-key'|'budget'|'error' }  otherwise
 *
 * Never throws: live retrieval is an enhancement to research, and its failure
 * modes (no key on a dev box, budget spent, API down) must degrade to the
 * local corpus, not take the research feature down with them.
 */
async function retrieveLive({ query, topK = 15, filters = {}, queryKind = "live-research" }) {
  const apiKey = process.env.LAWS_AFRICA_API_KEY;
  if (!apiKey) return { live: false, docs: [], reason: "no-key" };

  const q = String(query || "").trim();
  if (q.length < 3) return { live: false, docs: [], reason: "query-too-short" };

  try {
    if ((await budgetRemaining()) <= 0) {
      return { live: false, docs: [], reason: "budget" };
    }
  } catch (err) {
    // If the meter itself is broken, do not place unmetered calls.
    console.warn("[live-research] budget check failed:", err.message);
    return { live: false, docs: [], reason: "error" };
  }

  try {
    const results = await queryKnowledgeBase(apiKey, KB_CODE, q, topK, filters);
    const items = results.results || results.items || results || [];

    const docs = [];
    let newDocs = 0, upgraded = 0;
    for (const item of items) {
      // Cache-through: same identity rules, same dedupe, same upgrade-in-place
      // as the indexer. An insert failure must not cost the attorney a result
      // he can already see, so caching is best-effort per item.
      try {
        const outcome = await indexResult(item);
        if (outcome === "new") newDocs++;
        else if (outcome === "upgraded") upgraded++;
      } catch (err) {
        console.warn("[live-research] cache-through failed:", err.message);
      }
      const id = resolveIdentity(item);
      if (id.ok) docs.push(docFromIdentity(id.doc));
    }

    await pool.query(
      `insert into laws_africa_usage_log (query_kind, kb_code, results, new_docs, upgraded)
       values ($1, $2, $3, $4, $5)`,
      [queryKind, KB_CODE, items.length, newDocs, upgraded]
    ).catch(err => console.warn("[live-research] usage log failed:", err.message));

    return { live: true, docs, results: items.length, newDocs, upgraded };
  } catch (err) {
    console.warn("[live-research] retrieve failed:", err.message);
    await pool.query(
      `insert into laws_africa_usage_log (query_kind, kb_code, status, error_code)
       values ($1, $2, 'error', $3)`,
      [queryKind, KB_CODE, String(err.message).slice(0, 200)]
    ).catch(() => {});
    return { live: false, docs: [], reason: "error" };
  }
}

// "[2016] ZASCA 195" anywhere in a query — the shape attorneys paste.
const CITATION_IN_TEXT_RE = /\[(\d{4})\]\s+([A-Z]{3,10})\s+(\d+)/;

function extractCitationShape(text) {
  const m = CITATION_IN_TEXT_RE.exec(String(text || ""));
  return m ? `[${m[1]}] ${m[2]} ${m[3]}` : null;
}

/**
 * Exact lookup of one judgment by neutral citation, live. Returns the doc (also
 * cached into the corpus) or null. Falls back to null on budget/key/API
 * failure — the caller's local-corpus path still runs.
 */
async function lookupByCitation(citation) {
  const uri = frbrUriFromCitation(citation);
  if (!uri) return null;
  const res = await retrieveLive({
    query: citation,
    topK: 3,
    filters: { work_frbr_uri: uri },
    queryKind: "citation-lookup"
  });
  // The filter restricts the search space to that one work, but verify anyway:
  // never present a case as an exact citation match on the API's say-so alone.
  return res.docs.find(d => d.frbr_uri === uri) || null;
}

module.exports = {
  retrieveLive, lookupByCitation, extractCitationShape,
  budgetRemaining, callsUsedToday, DAILY_CAP, KB_CODE
};
