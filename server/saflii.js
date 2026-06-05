// server/saflii.js
// SAFLII (Southern African Legal Information Institute) corpus indexer.
// SAFLII is public domain — no API key required, but please respect robots.txt
// and add delays between requests. Run as a scheduled PM2 cron job.
//
// Usage: node server/saflii.js [--limit 50] [--court zacc]

require("dotenv").config();

const { pool } = require("./db");

const SAFLII_BASE = "https://www.saflii.org";

// South African courts available on SAFLII with their identifiers
const SA_COURTS = [
  { id: "zacc", label: "Constitutional Court", path: "/za/cases/ZACC/" },
  { id: "zasca", label: "Supreme Court of Appeal", path: "/za/cases/ZASCA/" },
  { id: "zagpjhc", label: "Gauteng High Court, Johannesburg", path: "/za/cases/ZAGPJHC/" },
  { id: "zagpphc", label: "Gauteng High Court, Pretoria", path: "/za/cases/ZAGPPHC/" },
  { id: "zawchc", label: "Western Cape High Court", path: "/za/cases/ZAWCHC/" },
  { id: "zakzdhc", label: "KwaZulu-Natal High Court, Durban", path: "/za/cases/ZAKZDHC/" },
  { id: "zafshc", label: "Free State High Court", path: "/za/cases/ZAFSHC/" },
  { id: "zalcc", label: "Labour Court", path: "/za/cases/ZALCC/" },
  { id: "zalac", label: "Labour Appeal Court", path: "/za/cases/ZALAC/" },
  { id: "zact", label: "Competition Tribunal", path: "/za/cases/ZACT/" }
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "LawPath-SA-Legal-Index/1.0 (research; contact: admin@lawpath.co.za)",
          "Accept": "text/html,application/xhtml+xml"
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await delay(2000 * (i + 1));
    }
  }
}

function extractCasesFromHtml(html, courtLabel, year) {
  const cases = [];
  // Match SAFLII case listing links: href="/za/cases/ZACC/2023/1.html"
  const linkRegex = /href="(\/za\/cases\/[A-Z]+\/(\d{4})\/(\d+)\.html)"/gi;
  const titleRegex = /<a[^>]*href="[^"]*\/(\d{4})\/(\d+)\.html"[^>]*>([^<]+)<\/a>/gi;
  let match;

  const titleMap = {};
  while ((match = titleRegex.exec(html)) !== null) {
    const key = `${match[1]}/${match[2]}`;
    titleMap[key] = match[3].trim();
  }

  const seen = new Set();
  while ((match = linkRegex.exec(html)) !== null) {
    const path = match[1];
    const caseYear = match[2];
    const caseNum = match[3];
    const key = `${caseYear}/${caseNum}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rawTitle = titleMap[key] || `${courtLabel} ${caseYear} (${caseNum})`;
    cases.push({
      path,
      year: parseInt(caseYear),
      caseNumber: caseNum,
      title: rawTitle.replace(/\s+/g, " ").trim()
    });
  }
  return cases;
}

function generateCitation(courtId, year, caseNumber) {
  const courtCodes = {
    zacc: "ZACC", zasca: "ZASCA", zagpjhc: "ZAGPJHC", zagpphc: "ZAGPPHC",
    zawchc: "ZAWCHC", zakzdhc: "ZAKZDHC", zafshc: "ZAFSHC",
    zalcc: "ZALCC", zalac: "ZALAC", zact: "ZACT"
  };
  return `[${year}] ${courtCodes[courtId] || courtId.toUpperCase()} ${caseNumber}`;
}

function extractSummaryFromCaseHtml(html) {
  // Try to extract headnotes or first paragraph of judgment
  const headnoteMatch = html.match(/(?:headnote|head-?note|summary)[^>]*>([^<]{100,})/i);
  if (headnoteMatch) return headnoteMatch[1].replace(/\s+/g, " ").trim().slice(0, 600);

  // Extract first substantial paragraph
  const parasMatch = html.match(/<p[^>]*>([^<]{120,})<\/p>/i);
  if (parasMatch) return parasMatch[1].replace(/\s+/g, " ").trim().slice(0, 600);

  return "";
}

function extractTagsFromTitle(title) {
  const tags = [];
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes("constitution") || lowerTitle.includes("right")) tags.push("constitutional");
  if (lowerTitle.includes("contract") || lowerTitle.includes("agreement")) tags.push("contract law");
  if (lowerTitle.includes("property") || lowerTitle.includes("transfer") || lowerTitle.includes("deed")) tags.push("property law");
  if (lowerTitle.includes("employ") || lowerTitle.includes("labour") || lowerTitle.includes("dismissal")) tags.push("employment");
  if (lowerTitle.includes("company") || lowerTitle.includes("director") || lowerTitle.includes("share")) tags.push("company law");
  if (lowerTitle.includes("criminal") || lowerTitle.includes("murder") || lowerTitle.includes("robbery")) tags.push("criminal");
  if (lowerTitle.includes("divorce") || lowerTitle.includes("marriage") || lowerTitle.includes("custody")) tags.push("family law");
  if (lowerTitle.includes("tax") || lowerTitle.includes("sars") || lowerTitle.includes("revenue")) tags.push("tax");
  if (lowerTitle.includes("bank") || lowerTitle.includes("credit") || lowerTitle.includes("nca")) tags.push("banking");
  if (lowerTitle.includes("negligence") || lowerTitle.includes("delict") || lowerTitle.includes("damages")) tags.push("delict");

  return [...new Set(tags)];
}

async function ensureSourceRecord(courtId, courtLabel) {
  const existing = await pool.query(
    "select id from legal_corpus_sources where court_or_body = $1 and source_type = 'case_law' limit 1",
    [courtLabel]
  );
  if (existing.rowCount) return existing.rows[0].id;

  const result = await pool.query(
    `insert into legal_corpus_sources (source_name, source_type, court_or_body, base_url, index_status, is_platform_corpus)
     values ($1, 'case_law', $2, $3, 'indexing', true) returning id`,
    [`SAFLII — ${courtLabel}`, courtLabel, `${SAFLII_BASE}/za/cases/${courtId.toUpperCase()}/`]
  );
  return result.rows[0].id;
}

async function indexCourt({ courtId, courtLabel, path, limitPerYear = 50, yearsBack = 5 }) {
  const sourceId = await ensureSourceRecord(courtId.toLowerCase(), courtLabel);
  const currentYear = new Date().getFullYear();
  let totalIndexed = 0;

  console.info(`[saflii] Indexing ${courtLabel} (${courtId})...`);

  for (let year = currentYear; year >= currentYear - yearsBack; year--) {
    try {
      const listUrl = `${SAFLII_BASE}${path}${year}/`;
      console.info(`[saflii] Fetching ${listUrl}`);
      const html = await fetchWithRetry(listUrl);
      await delay(1500);

      const cases = extractCasesFromHtml(html, courtLabel, year).slice(0, limitPerYear);
      console.info(`[saflii] Found ${cases.length} cases for ${year}`);

      for (const c of cases) {
        const citation = generateCitation(courtId, c.year, c.caseNumber);
        const sourceUrl = `${SAFLII_BASE}${c.path}`;

        // Skip if already indexed
        const exists = await pool.query(
          "select id from legal_corpus_documents where source_url = $1 limit 1", [sourceUrl]
        );
        if (exists.rowCount) continue;

        // Fetch case page for summary (optional, adds delay)
        let summary = "";
        try {
          const caseHtml = await fetchWithRetry(sourceUrl);
          summary = extractSummaryFromCaseHtml(caseHtml);
          await delay(1000);
        } catch {
          summary = `${courtLabel} judgment ${citation}.`;
        }

        const tags = extractTagsFromTitle(c.title);

        await pool.query(
          `insert into legal_corpus_documents
            (source_id, title, citation, court, decision_date, jurisdiction, document_type, summary, source_url, tags, year)
           values ($1,$2,$3,$4,$5,'South Africa','judgment',$6,$7,$8,$9)
           on conflict do nothing`,
          [sourceId, c.title, citation, courtLabel, `${c.year}-01-01`, summary, sourceUrl, tags, c.year]
        );
        totalIndexed++;
      }
    } catch (err) {
      console.error(`[saflii] Error indexing ${courtLabel} ${year}:`, err.message);
    }
  }

  // Update source record
  await pool.query(
    "update legal_corpus_sources set index_status='indexed', last_indexed_at=now(), document_count=document_count+$2 where id=$1",
    [sourceId, totalIndexed]
  );

  console.info(`[saflii] ${courtLabel}: indexed ${totalIndexed} new decisions`);
  return totalIndexed;
}

async function runIndexer({ limitPerYear = 30, yearsBack = 3, courtFilter = null } = {}) {
  console.info("[saflii] Starting SAFLII corpus indexer...");
  const start = Date.now();
  let totalNew = 0;

  const courts = courtFilter
    ? SA_COURTS.filter(c => c.id === courtFilter)
    : SA_COURTS;

  for (const court of courts) {
    try {
      totalNew += await indexCourt({ ...court, limitPerYear, yearsBack });
      await delay(3000); // Respectful delay between courts
    } catch (err) {
      console.error(`[saflii] Failed to index ${court.label}:`, err.message);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.info(`[saflii] Indexing complete. ${totalNew} new documents in ${elapsed}s`);

  await pool.end().catch(() => {});
}

// Run directly as a script
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const courtIdx = args.indexOf("--court");
  const yearsIdx = args.indexOf("--years");

  runIndexer({
    limitPerYear: limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 30,
    yearsBack: yearsIdx >= 0 ? parseInt(args[yearsIdx + 1]) : 3,
    courtFilter: courtIdx >= 0 ? args[courtIdx + 1] : null
  }).catch(err => {
    console.error("[saflii] Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { runIndexer, SA_COURTS };
