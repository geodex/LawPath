// server/saflii.js
// SA Legal Corpus indexer — powered by the Laws.Africa Knowledge Base API.
// SAFLII is behind Cloudflare bot protection so direct scraping no longer works.
// Laws.Africa free tier: 100 API calls/day (one call returns up to 20 results).
//
// Usage: node server/saflii.js [--queries 50] [--top-k 20]
//
// Environment:
//   LAWS_AFRICA_API_KEY  — Bearer token from https://platform.laws.africa/api-keys/
//   DATABASE_URL         — PostgreSQL connection string
//
// Each run picks a batch of legal-topic queries, retrieves matching judgments
// from the Knowledge Base, and upserts them into legal_corpus_documents.
// Re-running is safe — duplicates are skipped via source_url uniqueness.

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
];

// ─── COURT MAPPING ───────────────────────────────────────────────────────────

function guessCourtFromTitle(title) {
  const t = title.toLowerCase();
  if (t.includes("constitutional court") || t.includes("zacc")) return "Constitutional Court";
  if (t.includes("supreme court of appeal") || t.includes("zasca")) return "Supreme Court of Appeal";
  if (t.includes("labour appeal") || t.includes("zalac")) return "Labour Appeal Court";
  if (t.includes("labour court") || t.includes("zalcc")) return "Labour Court";
  if (t.includes("competition")) return "Competition Tribunal";
  if (t.includes("land claims")) return "Land Claims Court";
  if (t.includes("western cape") || t.includes("zawchc")) return "Western Cape High Court";
  if (t.includes("kwazulu") || t.includes("zakzdhc") || t.includes("durban")) return "KwaZulu-Natal High Court, Durban";
  if (t.includes("free state") || t.includes("zafshc") || t.includes("bloemfontein")) return "Free State High Court";
  if (t.includes("pretoria") || t.includes("zagpphc")) return "Gauteng High Court, Pretoria";
  if (t.includes("johannesburg") || t.includes("zagpjhc")) return "Gauteng High Court, Johannesburg";
  if (t.includes("high court") || t.includes("gauteng")) return "High Court";
  return "South African Court";
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

function extractYearFromText(text) {
  const match = text.match(/\[(\d{4})\]/);
  if (match) return parseInt(match[1]);
  const dateMatch = text.match(/\b(19|20)\d{2}\b/);
  if (dateMatch) return parseInt(dateMatch[0]);
  return null;
}

function extractCitationFromText(text) {
  const match = text.match(/\[\d{4}\]\s+[A-Z]+\s+\d+/);
  return match ? match[0] : null;
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function fetchKnowledgeBases(apiKey) {
  const res = await fetch(`${API_BASE}/knowledge-bases`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Knowledge bases list failed: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function queryKnowledgeBase(apiKey, kbCode, text, topK = 20) {
  const res = await fetch(`${API_BASE}/knowledge-bases/${kbCode}/retrieve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      top_k: topK,
      filters: { frbr_country: "za" }
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

async function indexResult(item) {
  const content = item.content?.text || item.text || "";
  const publicUrl = item.public_url || item.url || "";
  const title = item.title || content.slice(0, 120).split("\n")[0] || "Untitled judgment";

  if (!publicUrl && !content) return false;

  // Skip if already indexed by URL
  if (publicUrl) {
    const exists = await pool.query(
      "select id from legal_corpus_documents where source_url = $1 limit 1",
      [publicUrl]
    );
    if (exists.rowCount) return false;
  }

  const court = guessCourtFromTitle(title + " " + content);
  const tags = extractTagsFromText(title + " " + content);
  const year = extractYearFromText(title + " " + content);
  const citation = extractCitationFromText(title + " " + content);
  const summary = content.slice(0, 600).trim();
  const fullTextSnippet = content.slice(0, 2000).trim();

  const sourceId = await ensureSourceRecord(court);

  await pool.query(
    `insert into legal_corpus_documents
      (source_id, title, citation, court, decision_date, jurisdiction, document_type,
       summary, full_text_snippet, source_url, tags, year)
     values ($1,$2,$3,$4,$5,'South Africa','judgment',$6,$7,$8,$9,$10)
     on conflict do nothing`,
    [
      sourceId,
      title.slice(0, 500),
      citation,
      court,
      year ? `${year}-01-01` : null,
      summary,
      fullTextSnippet,
      publicUrl || null,
      tags,
      year
    ]
  );
  return true;
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

  // Pick the best KB — prefer one with "judgment" or "case" in the name, else first
  let kb = kbs.find(k => {
    const n = (k.name || k.title || "").toLowerCase();
    return n.includes("judgment") || n.includes("case") || n.includes("decision");
  }) || kbs[0];

  if (!kb) {
    console.error("[indexer] No knowledge bases available. Check your API key permissions.");
    process.exit(1);
  }

  const kbCode = kb.code || kb.id;
  console.info(`[indexer] Using knowledge base: ${kbCode} (${kb.name || kb.title})`);

  // 2. Shuffle queries for variety across runs
  const queries = [...QUERY_TOPICS].sort(() => Math.random() - 0.5).slice(0, maxQueries);

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    console.info(`[indexer] [${i + 1}/${queries.length}] Querying: "${query}"`);

    try {
      const results = await queryKnowledgeBase(apiKey, kbCode, query, topK);
      apiCalls++;
      const items = results.results || results.items || results || [];
      let batchNew = 0;

      for (const item of items) {
        try {
          const isNew = await indexResult(item);
          if (isNew) {
            batchNew++;
            totalNew++;
          }
        } catch (err) {
          console.warn(`[indexer]   DB insert error: ${err.message}`);
        }
      }

      console.info(`[indexer]   ${items.length} results, ${batchNew} new → DB`);

      // Respect rate limits — 1 second between calls
      await delay(1000);
    } catch (err) {
      if (err.message.includes("429")) {
        console.warn("[indexer] Rate limited — stopping. Re-run tomorrow to continue.");
        break;
      }
      console.error(`[indexer]   Query failed: ${err.message}`);
      await delay(2000);
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
  console.info(`[indexer] Complete — ${totalNew} new documents indexed in ${elapsed}s (${apiCalls} API calls used).`);
  console.info(`[indexer] Free tier: 100 calls/day. Used ${apiCalls}. ${Math.max(0, 100 - apiCalls)} remaining today.`);

  await pool.end().catch(() => {});
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const queriesIdx = args.indexOf("--queries");
  const topKIdx = args.indexOf("--top-k");

  runIndexer({
    maxQueries: queriesIdx >= 0 ? parseInt(args[queriesIdx + 1]) : 50,
    topK:       topKIdx >= 0 ? parseInt(args[topKIdx + 1]) : 20
  }).catch(err => {
    console.error("[indexer] Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { runIndexer, QUERY_TOPICS };
