// server/seed-corpus.js
// Seeds legal_corpus_documents with landmark SA cases.
// Usage: node server/seed-corpus.js
require("dotenv").config();
const { pool } = require("./db");
const path = require("path");
const fs = require("fs");

// Load all part files from seed-parts/
const partsDir = path.join(__dirname, "seed-parts");
let CASES = [];
if (fs.existsSync(partsDir)) {
  const files = fs.readdirSync(partsDir).filter(f => f.endsWith(".js")).sort();
  for (const file of files) {
    const cases = require(path.join(partsDir, file));
    console.info(`[seed] Loaded ${cases.length} cases from ${file}`);
    CASES.push(...cases);
  }
}

// Deduplicate by citation
const seen = new Set();
CASES = CASES.filter(c => {
  if (seen.has(c.citation)) return false;
  seen.add(c.citation);
  return true;
});

console.info(`[seed] ${CASES.length} unique cases after deduplication.`);

async function seed() {
  console.info(`[seed] Seeding ${CASES.length} landmark SA cases...`);
  let inserted = 0;

  for (const c of CASES) {
    const srcRes = await pool.query(
      "select id from legal_corpus_sources where court_or_body = $1 and source_type = 'case_law' limit 1",
      [c.court]
    );
    let sourceId;
    if (srcRes.rowCount) {
      sourceId = srcRes.rows[0].id;
    } else {
      const ins = await pool.query(
        `insert into legal_corpus_sources (source_name, source_type, court_or_body, base_url, index_status, is_platform_corpus, document_count)
         values ($1, 'case_law', $2, 'https://www.saflii.org', 'indexed', true, 0) returning id`,
        [`SAFLII — ${c.court}`, c.court]
      );
      sourceId = ins.rows[0].id;
    }

    const exists = await pool.query(
      "select id from legal_corpus_documents where citation = $1 limit 1",
      [c.citation]
    );
    if (exists.rowCount) continue;

    await pool.query(
      `insert into legal_corpus_documents
        (source_id, title, citation, court, decision_date, jurisdiction, document_type,
         summary, full_text_snippet, source_url, tags, year)
       values ($1,$2,$3,$4,$5,'South Africa','judgment',$6,$7,$8,$9,$10)
       on conflict do nothing`,
      [
        sourceId, c.title, c.citation, c.court, `${c.year}-01-01`,
        c.summary, c.summary, c.url, c.tags, c.year
      ]
    );
    inserted++;
    console.info(`[seed]   ✓ ${c.citation} — ${c.title}`);
  }

  // Update source counts
  const counts = await pool.query("select court, count(*) as cnt from legal_corpus_documents group by court");
  for (const r of counts.rows) {
    await pool.query(
      "update legal_corpus_sources set document_count = $2, last_indexed_at = now() where court_or_body = $1",
      [r.court, parseInt(r.cnt)]
    ).catch(() => {});
  }

  console.info(`[seed] Done — ${inserted} new cases inserted (${CASES.length - inserted} already existed).`);
  await pool.end().catch(() => {});
}

seed().catch(err => { console.error("[seed] Fatal:", err); process.exit(1); });
