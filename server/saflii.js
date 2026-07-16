// server/saflii.js
// SA Legal Corpus indexer — powered by the Laws.Africa Knowledge Base API.
// Sandbox plan: 30 calls/min, 100 calls/day. Each call returns up to 20 results.
// Queries the SA JUDGMENTS knowledge base only (judgments-za).
// Run daily to grow the corpus — shuffled topics ensure variety across runs.
//
// Usage: node server/saflii.js [--queries 95] [--top-k 20]
//
// Environment:
//   LAWS_AFRICA_API_KEY  — Bearer token from https://platform.laws.africa/api-keys/
//   DATABASE_URL         — PostgreSQL connection string
//
// Each run picks a batch of legal-topic queries, retrieves matching judgments,
// and upserts them into legal_corpus_documents keyed on the work FRBR URI.
//
// IDENTITY IS PARSED FROM metadata.work_frbr_uri, NEVER FROM THE PROSE. See
// resolveIdentity below, and migration 031 for how ~8,955 anonymous rows got
// into the corpus and why an unnameable row is refused rather than stored.
//
// Re-running is safe: dedup is enforced by a unique index on frbr_uri, and a
// judgment already held is upgraded in place only when the incoming row carries
// more text than the stored one.

require("dotenv").config();

const { pool } = require("./db");

const API_BASE = "https://api.laws.africa/ai/v1";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── QUERY TOPICS ────────────────────────────────────────────────────────────
// Each query is sent to the Knowledge Base to pull diverse SA case law.

const QUERY_TOPICS = [
  // Constitutional & human rights
  "right to equality South Africa",
  "freedom of expression constitutional court",
  "right to housing eviction",
  "right to dignity South Africa",
  "right to life death penalty",
  "freedom of religion South Africa",
  "right to access to information",
  "right to just administrative action PAJA",
  "children's rights best interests",
  "right to education South Africa",
  "property rights expropriation",
  "right to privacy South Africa",
  "freedom of association South Africa",
  "limitation of rights section 36",

  // Contract law
  "breach of contract damages South Africa",
  "specific performance contract",
  "cancellation of contract repudiation",
  "voetstoots clause defects",
  "restraint of trade enforceability",
  "cession and delegation",
  "contractual interpretation South Africa",
  "misrepresentation contract voidable",
  "impossibility of performance supervening",
  "penalty clause conventional penalty",

  // Delict
  "negligence duty of care South Africa",
  "wrongfulness delict aquilian action",
  "pure economic loss delict",
  "defamation South Africa",
  "medical negligence malpractice",
  "product liability manufacturer",
  "vicarious liability employer",
  "nuisance neighbour law",
  "emotional shock nervous shock",
  "contributory negligence apportionment",

  // Property law
  "transfer of immovable property",
  "sectional title body corporate",
  "servitude right of way",
  "prescription acquisitive 30 years",
  "landlord tenant eviction PIE Act",
  "mortgage bond foreclosure",
  "mineral rights MPRDA",
  "expropriation compensation",

  // Family law
  "divorce division matrimonial property",
  "maintenance defaulting spouse",
  "custody best interests child",
  "domestic violence protection order",
  "adoption South Africa",
  "recognition customary marriage",
  "accrual system marriage",
  "parental rights responsibilities",

  // Company law
  "director fiduciary duty Companies Act",
  "business rescue practitioner",
  "winding up liquidation company",
  "shareholder oppression remedy",
  "piercing corporate veil",
  "derivative action section 165",
  "delinquent director declaration",

  // Employment / Labour
  "unfair dismissal CCMA",
  "constructive dismissal Labour Court",
  "automatically unfair dismissal",
  "equal pay discrimination workplace",
  "retrenchment operational requirements",
  "transfer of undertaking section 197",
  "strike action protected unprotected",
  "sexual harassment workplace",
  "fixed term contract employee",

  // Criminal law
  "murder dolus eventualis",
  "robbery aggravating circumstances",
  "fraud misrepresentation criminal",
  "corruption Prevention Combating Act",
  "sexual offences SORMA",
  "bail appeal factors",
  "minimum sentencing schedule",
  "self-defence private defence",

  // Banking & finance
  "National Credit Act affordability",
  "reckless credit agreement",
  "in duplum rule interest",
  "bank client relationship duty",
  "suretyship married person",
  "prescription debt three years",

  // Tax
  "income tax general anti-avoidance GAAR",
  "capital gains tax disposal",
  "VAT zero-rated supply",
  "SARS assessment objection appeal",
  "tax residence South Africa",

  // Administrative law
  "judicial review administrative action",
  "PAJA review grounds",
  "rationality review executive decision",
  "legitimate expectation procedural fairness",
  "rule of law principle",
  "Promotion of Access to Information Act",

  // Consumer protection
  "Consumer Protection Act unfair terms",
  "product liability CPA",
  "consumer rights cooling off period",
  "marketing direct marketing unsolicited",

  // Environmental
  "NEMA environmental authorisation",
  "environmental impact assessment appeal",
  "water use licence National Water Act",
  "waste management NEMWA",

  // Insolvency
  "sequestration voluntary surrender",
  "rehabilitation insolvent estate",
  "voidable preference insolvency",
  "concurrent creditors distribution",

  // Intellectual property
  "trademark infringement passing off",
  "copyright infringement reproduction",
  "patent validity South Africa",
  "unlawful competition goodwill",

  // Customary law
  "customary law succession inheritance",
  "customary marriage recognition",
  "traditional leadership succession dispute",
  "indigenous land rights community",
  "lobola bride price customary",

  // Land reform & restitution
  "land restitution claim dispossession",
  "ESTA farm eviction occupier",
  "land reform redistribution",
  "labour tenant rights security tenure",

  // Social security & health
  "social grants SASSA payment",
  "right to health care treatment",
  "medical negligence hospital birth injury",
  "HIV AIDS discrimination treatment",

  // Procurement & municipal
  "tender award irregular procurement",
  "MFMA supply chain management",
  "municipal rates services disconnection",
  "municipal planning zoning rezoning",

  // Insurance & suretyship
  "insurance claim repudiation indemnity",
  "suretyship liability guarantor",
  "short-term insurance motor vehicle",
  "life insurance beneficiary nomination",

  // Trusts & estates
  "trust beneficiary trustee duties",
  "will validity formalities attestation",
  "estate administration executor",
  "fideicommissum trust substitution",

  // Road Accident Fund
  "Road Accident Fund claim damages",
  "RAF loss of support dependant",
  "RAF future medical expenses",

  // Shipping & admiralty
  "admiralty arrest vessel maritime",
  "shipping cargo damage carriage",
  "salvage maritime law",

  // Competition additional
  "cartel price fixing horizontal",
  "abuse of dominance excessive pricing",
  "merger approval conditions competition",

  // Mining additional
  "mining right application MPRDA",
  "mine closure rehabilitation environmental",
  "community consultation mining prospecting",

  // Media & data protection
  "POPIA data protection personal information",
  "media freedom press reporting",
  "access to information PAIA request",
  "cyber crime electronic communications",

  // Elections & political
  "election dispute electoral court",
  "political party funding disclosure",
  "freedom of assembly gathering protest",

  // Arbitration
  "arbitration award review set aside",
  "international arbitration enforcement",
  "mediation settlement agreement",
];

// ─── IDENTITY ────────────────────────────────────────────────────────────────
// Identity comes from the Akoma Ntoso FRBR metadata Laws.Africa attaches to
// every result. It is NEVER inferred from the judgment's prose.
//
// The previous implementation scanned the text with regexes, which is unsound
// for the simple reason that judgments cite other judgments: the first "[YYYY]
// COURT N" in a High Court judgment is usually an SCA case it relies on, and the
// first "X v Y" is usually that case's name. Fed a 2023 Gauteng judgment citing
// Trust Bank, it stored the row as "Natal v Trust Bank", [1979] ZASCA 56,
// Constitutional Court, 1979 — a real case name welded onto another case's
// facts, which is precisely what the testing attorney caught and rejected.
//
// A work FRBR URI (/akn/za/judgment/zasca/2025/162) is assigned by Laws.Africa
// and names the judgment itself. Court, year and number are a parse of it, so
// they cannot belong to a different case.

// Akoma Ntoso court code -> court name. A lookup keyed on the URI's code, not a
// guess from prose. Codes absent here keep their uppercase code as the label
// (e.g. "ZAMPMBHC"): accurate and identifiable, where a guess is neither, and
// the code is what a practitioner would recognise anyway.
const COURT_BY_FRBR_CODE = {
  zacc:      "Constitutional Court",
  zasca:     "Supreme Court of Appeal",
  zagpphc:   "Gauteng High Court, Pretoria",
  zagpjhc:   "Gauteng High Court, Johannesburg",
  zawchc:    "Western Cape High Court",
  zakzdhc:   "KwaZulu-Natal High Court, Durban",
  zakzphc:   "KwaZulu-Natal High Court, Pietermaritzburg",
  zafshc:    "Free State High Court",
  zaechc:    "Eastern Cape High Court",
  zaecghc:   "Eastern Cape High Court, Grahamstown",
  zaecphc:   "Eastern Cape High Court, Port Elizabeth",
  zanwhc:    "North West High Court",
  zanchc:    "Northern Cape High Court",
  zampmbhc:  "Mpumalanga High Court, Middelburg",
  zalmpphc:  "Limpopo High Court, Polokwane",
  zalac:     "Labour Appeal Court",
  zalc:      "Labour Court",
  zalcjhc:   "Labour Court, Johannesburg",
  zalcct:    "Labour Court, Cape Town",
  zalcc:     "Land Claims Court",
  zact:      "Competition Tribunal",
  zacac:     "Competition Appeal Court",
  zatc:      "Tax Court",
  zasct:     "Small Claims Court",
  zaecbhc:   "Eastern Cape High Court, Bhisho",
  zaecmhc:   "Eastern Cape High Court, Mthatha",
  zalcjhb:   "Labour Court, Johannesburg",
  zast:      "Special Tribunal"
};

// AKN jurisdiction element per court code. National courts sit at /akn/za/...;
// provincial High Courts at /akn/za-<province>/... (the first indexer run under
// 031 rejected 208 results, most of them High Court judgments, because the URI
// regex only accepted the national form). Parsing preserves whatever
// jurisdiction the URI carries; this map is for the OTHER direction — building
// a URI from a pasted citation, where the citation alone ("[2023] ZAGPJHC 729")
// does not say which /akn/ jurisdiction the work lives under. Codes absent here
// are national (fall back to "za").
const LOCALITY_BY_FRBR_CODE = {
  zagpphc:  "za-gp",  zagpjhc:  "za-gp",
  zawchc:   "za-wc",
  zakzdhc:  "za-kzn", zakzphc:  "za-kzn",
  zafshc:   "za-fs",
  zaechc:   "za-ec",  zaecghc:  "za-ec", zaecphc: "za-ec",
  zaecbhc:  "za-ec",  zaecmhc:  "za-ec",
  zanwhc:   "za-nw",
  zanchc:   "za-nc",
  zampmbhc: "za-mp",
  zalmpphc: "za-lp"
};

// /akn/za/judgment/zasca/2025/162     -> { jurisdiction: "za",    code: "zasca",   year: 2025, number: "162" }
// /akn/za-gp/judgment/zagpjhc/2023/729 -> { jurisdiction: "za-gp", code: "zagpjhc", year: 2023, number: "729" }
// Anchored and judgment-only on purpose: a legislation URI (/akn/za/act/2013/4)
// must NOT parse here. The old code hardcoded document_type 'judgment' on every
// insert, so POPIA was filed as a court decision with a guessed court.
// Jurisdiction is za or za-<locality> only: /akn/gh/... (Ghana) must not parse.
const WORK_URI_RE = /^\/akn\/(za(?:-[a-z]{2,3})?)\/judgment\/([a-z0-9-]+)\/(\d{4})\/(\d+)\b/i;

function parseWorkUri(uri) {
  const m = WORK_URI_RE.exec(String(uri || "").trim());
  if (!m) return null;
  return { jurisdiction: m[1].toLowerCase(), code: m[2].toLowerCase(), year: parseInt(m[3], 10), number: m[4] };
}

function courtFromFrbrCode(code) {
  return COURT_BY_FRBR_CODE[code] || code.toUpperCase();
}

// "[2025] ZASCA 162" — assembled from the URI's own components.
function citationFromWorkUri(parsed) {
  return `[${parsed.year}] ${parsed.code.toUpperCase()} ${parsed.number}`;
}

function extractTagsFromText(text) {
  const tags = [];
  const t = text.toLowerCase();
  if (t.includes("constitution") || t.includes("bill of rights")) tags.push("constitutional");
  if (t.includes("contract") || t.includes("agreement") || t.includes("breach")) tags.push("contract law");
  if (t.includes("property") || t.includes("transfer") || t.includes("deed") || t.includes("eviction")) tags.push("property law");
  if (t.includes("employ") || t.includes("labour") || t.includes("dismissal") || t.includes("ccma")) tags.push("employment");
  if (t.includes("company") || t.includes("director") || t.includes("shareholder")) tags.push("company law");
  if (t.includes("criminal") || t.includes("murder") || t.includes("robbery") || t.includes("bail")) tags.push("criminal");
  if (t.includes("divorce") || t.includes("marriage") || t.includes("custody") || t.includes("maintenance")) tags.push("family law");
  if (t.includes("tax") || t.includes("sars") || t.includes("revenue") || t.includes("vat")) tags.push("tax");
  if (t.includes("bank") || t.includes("credit") || t.includes("nca") || t.includes("surety")) tags.push("banking");
  if (t.includes("negligence") || t.includes("delict") || t.includes("damages") || t.includes("defamation")) tags.push("delict");
  if (t.includes("consumer") || t.includes("cpa")) tags.push("consumer");
  if (t.includes("environment") || t.includes("nema") || t.includes("water")) tags.push("environmental");
  if (t.includes("insolvency") || t.includes("sequestration") || t.includes("liquidation")) tags.push("insolvency");
  if (t.includes("trademark") || t.includes("copyright") || t.includes("patent")) tags.push("intellectual property");
  if (t.includes("administrative") || t.includes("paja") || t.includes("judicial review")) tags.push("administrative");
  return [...new Set(tags)];
}

// Resolve a result to a citable judgment, or explain why it cannot be.
//
// Returns { ok: true, doc } or { ok: false, reason }. There is deliberately no
// third option: a row we cannot name does not get stored. ~8,955 rows were
// indexed without citation, URL or real title precisely because the old code
// inserted whatever it had and guessed the rest. An unnameable judgment in the
// corpus is worse than no judgment, because retrieval feeds it to the model as
// an authority it is then unable to cite — which is what drove it back to recall
// and produced the fabricated citations.
function resolveIdentity(item) {
  const md = item?.metadata || {};
  const text = item?.content?.text || "";

  // The whole bug in one line: these live under `metadata`, and the old code
  // read item.public_url / item.url / item.title at the top level. Every one was
  // undefined on every call, for every row ever indexed.
  const parsed = parseWorkUri(md.work_frbr_uri);
  if (!parsed) return { ok: false, reason: `no parsable judgment work URI (${md.work_frbr_uri || "absent"})` };
  // frbr_country may carry the locality ("za-gp") on provincial judgments.
  const country = String(md.frbr_country || "").toLowerCase();
  if (country && country !== "za" && !country.startsWith("za-")) return { ok: false, reason: `not SA (${md.frbr_country})` };
  if (md.frbr_doctype && String(md.frbr_doctype).toLowerCase() !== "judgment") return { ok: false, reason: `not a judgment (${md.frbr_doctype})` };
  if (!String(md.title || "").trim()) return { ok: false, reason: "no title in metadata" };
  if (!text.trim()) return { ok: false, reason: "no content text" };

  // expression_date is the real handing-down date. The old code wrote
  // `${year}-01-01` for every row — a fabricated day and month on every
  // judgment in the corpus.
  const decisionDate = /^\d{4}-\d{2}-\d{2}$/.test(String(md.expression_date || ""))
    ? md.expression_date
    : null;

  // flynote is the court's own subject classification ("Delict — Conveyancing —
  // Negligence and causation"), so tag from it in preference to the prose.
  const tagSource = [md.flynote, md.blurb, md.title].filter(Boolean).join(" ") || text;

  return {
    ok: true,
    doc: {
      // The jurisdiction the URI arrived with, preserved — re-assembling it as
      // /akn/za/... would store an identity the KB itself does not use, and the
      // exact-lookup filter (work_frbr_uri) would never match it again.
      frbrUri:  `/akn/${parsed.jurisdiction}/judgment/${parsed.code}/${parsed.year}/${parsed.number}`,
      title:    String(md.title).trim(),
      citation: citationFromWorkUri(parsed),
      court:    courtFromFrbrCode(parsed.code),
      year:     parsed.year,
      decisionDate,
      // blurb is Laws.Africa's one-line holding; fall back to the summary text.
      summary:  String(md.blurb || "").trim() || text.slice(0, 600).trim(),
      fullText: text.trim(),
      // public_url points at the judgment on lawlibrary.org.za. The attorney's
      // workflow is research -> go read the actual case, so this is the link
      // that makes the corpus useful rather than merely citable.
      sourceUrl: String(md.public_url || "").trim() || null,
      tags:      extractTagsFromText(tagSource)
    }
  };
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function fetchKnowledgeBases(apiKey) {
  const res = await fetch(`${API_BASE}/knowledge-bases`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Knowledge bases list failed: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// filters merge over the SA default. Live research passes work_frbr_uri here
// for exact citation lookup — the retrieve API accepts work_frbr_uri /
// work_frbr_uri__in / expression_frbr_uri / frbr_doctype etc. as documented at
// developers.laws.africa/knowledge-bases/filters.
async function queryKnowledgeBase(apiKey, kbCode, text, topK = 20, filters = {}) {
  const res = await fetch(`${API_BASE}/knowledge-bases/${kbCode}/retrieve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      top_k: topK,
      filters: { frbr_country: "za", ...filters }
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`KB retrieve failed: HTTP ${res.status} ${body}`);
  }
  return res.json();
}

// ─── INDEXER ─────────────────────────────────────────────────────────────────

async function ensureSourceRecord(courtLabel) {
  const existing = await pool.query(
    "select id from legal_corpus_sources where court_or_body = $1 and source_type = 'case_law' limit 1",
    [courtLabel]
  );
  if (existing.rowCount) return existing.rows[0].id;

  const result = await pool.query(
    `insert into legal_corpus_sources (source_name, source_type, court_or_body, base_url, index_status, is_platform_corpus)
     values ($1, 'case_law', $2, 'https://lawlibrary.org.za', 'indexed', true) returning id`,
    [`Laws.Africa — ${courtLabel}`, courtLabel]
  );
  return result.rows[0].id;
}

// Index one result. Returns 'new' | 'upgraded' | 'duplicate' | a rejection reason.
//
// The old version's dedup check sat inside `if (publicUrl)`. Since publicUrl was
// always undefined (wrong nesting level), the check never ran and every run
// re-inserted everything the previous run had fetched — 8,955 rows holding 1,701
// distinct texts. Dedup is now unconditional and enforced by the database, on
// the work FRBR URI (migration 031), so it cannot be skipped by a field being
// absent.
//
// On conflict it UPGRADES rather than skips, when the incoming row carries more
// text than the one already stored. That is what repairs the 504 curated seeds:
// they hold a correct citation but only a ~103-character one-line summary and a
// fabricated YYYY-01-01 decision date. Once corpus-frbr-backfill.js gives them
// the frbr_uri their citation already implies, the next run that retrieves the
// same judgment replaces the stub with the full Laws.Africa summary, the real
// handing-down date and the authoritative title — in place, at no extra API
// cost. (Full judgment text is not available to us: SAFLII and lawlibrary.org.za
// are both behind bot protection, and the Laws.Africa content API returns
// "You do not have permission to perform this action" on the AI KB plan.)
//
// Strictly-greater on length, so a run that returns a shorter passage for a
// judgment we already hold richly cannot degrade it.
async function indexResult(item) {
  const id = resolveIdentity(item);
  if (!id.ok) return id.reason;

  const d = id.doc;
  const sourceId = await ensureSourceRecord(d.court);

  const res = await pool.query(
    `insert into legal_corpus_documents
      (source_id, frbr_uri, title, citation, court, decision_date, jurisdiction, document_type,
       summary, full_text_snippet, source_url, tags, year)
     values ($1,$2,$3,$4,$5,$6,'South Africa','judgment',$7,$8,$9,$10,$11)
     on conflict (frbr_uri) where frbr_uri is not null do update
        set source_id         = excluded.source_id,
            title             = excluded.title,
            citation          = excluded.citation,
            court             = excluded.court,
            decision_date     = excluded.decision_date,
            summary           = excluded.summary,
            full_text_snippet = excluded.full_text_snippet,
            source_url        = excluded.source_url,
            tags              = excluded.tags,
            year              = excluded.year,
            indexed_at        = now()
      where length(coalesce(excluded.full_text_snippet, '')) >
            length(coalesce(legal_corpus_documents.full_text_snippet, ''))
     returning (xmax = 0) as inserted`,
    [
      sourceId,
      d.frbrUri,
      d.title,
      d.citation,
      d.court,
      d.decisionDate,
      d.summary,
      d.fullText,
      d.sourceUrl,
      d.tags,
      d.year
    ]
  );
  // No row back means the conflict fired but the upgrade condition did not: we
  // already hold this judgment at least as richly.
  if (!res.rowCount) return "duplicate";
  return res.rows[0].inserted ? "new" : "upgraded";
}

async function runIndexer({ maxQueries = 50, topK = 20 } = {}) {
  const apiKey = process.env.LAWS_AFRICA_API_KEY;
  if (!apiKey) {
    console.error("[indexer] LAWS_AFRICA_API_KEY is not set.");
    console.error("[indexer] Get a free API key at https://platform.laws.africa/api-keys/");
    process.exit(1);
  }

  console.info("[indexer] Starting Laws.Africa corpus indexer...");
  console.info(`[indexer] Will run up to ${maxQueries} queries, ${topK} results each.`);
  const start = Date.now();
  let totalNew = 0;
  let totalUpgraded = 0;
  let totalDuplicate = 0;
  let totalRejected = 0;
  let apiCalls = 0;

  // 1. Discover available knowledge bases
  console.info("[indexer] Fetching knowledge bases...");
  let kbList;
  try {
    kbList = await fetchKnowledgeBases(apiKey);
    apiCalls++;
  } catch (err) {
    console.error(`[indexer] Failed to list knowledge bases: ${err.message}`);
    process.exit(1);
  }

  const kbs = kbList.results || kbList || [];
  console.info(`[indexer] Found ${kbs.length} knowledge base(s):`);
  for (const kb of kbs) {
    console.info(`[indexer]   ${kb.code || kb.id}: ${kb.name || kb.title || "—"}`);
  }

  // The SA judgments KB, by exact code. The API serves eight countries
  // (judgments-gh, judgments-ls, judgments-na, judgments-tz, judgments-ug,
  // judgments-zm, judgments-zw, judgments-za), and the previous selector fell
  // back to `kbs[0]` — which is judgments-gh, Ghana — if its fuzzy match missed.
  // An SA legal corpus quietly filling with Ghanaian judgments is not a failure
  // mode worth leaving open for the sake of a fallback.
  const judgmentKb = kbs.find(k => (k.code || k.id || "").toLowerCase() === "judgments-za");

  if (!judgmentKb) {
    console.error("[indexer] The judgments-za knowledge base is not available on this key.");
    console.error(`[indexer] Available: ${kbs.map(k => k.code || k.id).join(", ") || "(none)"}`);
    process.exit(1);
  }

  console.info(`[indexer] Judgments KB: ${judgmentKb.code || judgmentKb.id} (${judgmentKb.name || judgmentKb.title || "—"})`);

  // 2. Build work items. JUDGMENTS ONLY.
  //
  // The legislation KB is deliberately not queried. Its results are Acts, whose
  // FRBR URIs are /akn/za/act/... — they have no court, no citation and no
  // decision date, but the old insert hardcoded document_type 'judgment' and ran
  // them through guessCourtFromTitle anyway. That is how POPIA ended up filed as
  // a court decision. Legislation needs its own identity handling and its own
  // document_type before it belongs in here; until then the whole budget goes to
  // case law, which is what practitioners asked for.
  const shuffled = [...QUERY_TOPICS].sort(() => Math.random() - 0.5);
  const jCode = judgmentKb.code || judgmentKb.id;
  const workItems = shuffled.slice(0, maxQueries).map(q => ({ query: q, kbCode: jCode }));

  // Why each result was turned away, so a rejection rate is visible rather than
  // silent. Silence is how the corpus filled with 8,955 unnameable rows.
  const rejected = {};

  for (let i = 0; i < workItems.length; i++) {
    const { query, kbCode } = workItems[i];
    console.info(`[indexer] [${i + 1}/${workItems.length}] "${query}"`);

    try {
      const results = await queryKnowledgeBase(apiKey, kbCode, query, topK);
      apiCalls++;
      const items = results.results || results.items || results || [];
      let batchNew = 0, batchUp = 0, batchDup = 0, batchRej = 0;

      for (const item of items) {
        try {
          const outcome = await indexResult(item);
          if (outcome === "new") { batchNew++; totalNew++; }
          else if (outcome === "upgraded") { batchUp++; totalUpgraded++; }
          else if (outcome === "duplicate") { batchDup++; totalDuplicate++; }
          else {
            batchRej++;
            totalRejected++;
            rejected[outcome] = (rejected[outcome] || 0) + 1;
          }
        } catch (err) {
          console.warn(`[indexer]   DB insert error: ${err.message}`);
        }
      }

      console.info(`[indexer]   ${items.length} results → ${batchNew} new, ${batchUp} upgraded, ${batchDup} dup, ${batchRej} rejected`);

      // Feed the shared daily meter (033). Live research shares the same 100
      // calls/day and its budget guard is blind to the batch without this.
      // best-effort: a metering failure must not abort an indexing run.
      await pool.query(
        `insert into laws_africa_usage_log (query_kind, kb_code, results, new_docs, upgraded)
         values ('indexer', $1, $2, $3, $4)`,
        [kbCode, items.length, batchNew, batchUp]
      ).catch(err => console.warn(`[indexer]   usage log failed: ${err.message}`));

      // Respect rate limits — 2 seconds between calls (30/min limit)
      await delay(2100);
    } catch (err) {
      await pool.query(
        `insert into laws_africa_usage_log (query_kind, kb_code, status, error_code)
         values ('indexer', $1, 'error', $2)`,
        [kbCode, String(err.message).slice(0, 200)]
      ).catch(() => {});
      if (err.message.includes("429")) {
        console.warn("[indexer] Rate limited — stopping. Re-run tomorrow to continue.");
        break;
      }
      if (err.message.includes("403")) {
        console.warn(`[indexer]   403 on judgments KB — skipping. Check plan permissions.`);
        continue;
      }
      console.error(`[indexer]   Query failed: ${err.message}`);
      await delay(2000);
    }
  }

  if (Object.keys(rejected).length) {
    console.info("[indexer] Rejected (not stored — a row we cannot name is worse than no row):");
    for (const [reason, n] of Object.entries(rejected).sort((a, b) => b[1] - a[1])) {
      console.info(`[indexer]   ${String(n).padStart(4)}  ${reason}`);
    }
  }

  // 3. Update source record counts
  const countResult = await pool.query(
    "select court, count(*) as cnt from legal_corpus_documents group by court"
  );
  for (const row of countResult.rows) {
    await pool.query(
      "update legal_corpus_sources set document_count = $2, last_indexed_at = now() where court_or_body = $1",
      [row.court, parseInt(row.cnt)]
    ).catch(() => {});
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.info(`[indexer] Complete in ${elapsed}s — ${totalNew} new, ${totalUpgraded} upgraded, ${totalDuplicate} duplicate, ${totalRejected} rejected (${apiCalls} API calls used).`);
  console.info(`[indexer] Free tier: 100 calls/day. Used ${apiCalls}. ${Math.max(0, 100 - apiCalls)} remaining today.`);

  await pool.end().catch(() => {});
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const queriesIdx = args.indexOf("--queries");
  const topKIdx = args.indexOf("--top-k");

  runIndexer({
    maxQueries: queriesIdx >= 0 ? parseInt(args[queriesIdx + 1]) : 95,
    topK:       topKIdx >= 0 ? parseInt(args[topKIdx + 1]) : 20
  }).catch(err => {
    console.error("[indexer] Fatal error:", err);
    process.exit(1);
  });
}

// resolveIdentity and its helpers are exported so the identity rules can be
// tested directly against real API response shapes. The regex-scraping they
// replaced was only reachable through a live API call, which is a large part of
// why it went ~9,000 rows without anyone noticing it was discarding every field.
module.exports = {
  runIndexer, QUERY_TOPICS, indexResult, queryKnowledgeBase,
  parseWorkUri, courtFromFrbrCode, citationFromWorkUri, resolveIdentity,
  LOCALITY_BY_FRBR_CODE
};
