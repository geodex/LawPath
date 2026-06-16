// server/saflii.js
// SAFLII (Southern African Legal Information Institute) corpus indexer.
// SAFLII is public domain — no API key required, but please respect robots.txt
// and add delays between requests. Run as a scheduled PM2 cron job.
//
// Usage: node server/saflii.js [--limit 50] [--court zacc] [--years 5]
//
// Full judgment HTML + plain text are uploaded to GCS at:
//   saflii/{courtId}/{year}/{caseNumber}.html  (raw HTML)
//   saflii/{courtId}/{year}/{caseNumber}.txt   (plain text for RAG)
// The GCS URI of the .txt file is stored in legal_corpus_documents.gcs_uri.

require("dotenv").config();

const { pool } = require("./db");
const { uploadBuffer, safeObjectPart, configuredBucketName } = require("./gcs");

const SAFLII_BASE = "https://www.saflii.org";
const GCS_PREFIX = "saflii";

const SA_COURTS = [
  { id: "zacc",    label: "Constitutional Court",              path: "/za/cases/ZACC/" },
  { id: "zasca",   label: "Supreme Court of Appeal",           path: "/za/cases/ZASCA/" },
  { id: "zagpjhc", label: "Gauteng High Court, Johannesburg",  path: "/za/cases/ZAGPJHC/" },
  { id: "zagpphc", label: "Gauteng High Court, Pretoria",      path: "/za/cases/ZAGPPHC/" },
  { id: "zawchc",  label: "Western Cape High Court",           path: "/za/cases/ZAWCHC/" },
  { id: "zakzdhc", label: "KwaZulu-Natal High Court, Durban",  path: "/za/cases/ZAKZDHC/" },
  { id: "zafshc",  label: "Free State High Court",             path: "/za/cases/ZAFSHC/" },
  { id: "zalcc",   label: "Labour Court",                      path: "/za/cases/ZALCC/" },
  { id: "zalac",   label: "Labour Appeal Court",               path: "/za/cases/ZALAC/" },
  { id: "zact",    label: "Competition Tribunal",              path: "/za/cases/ZACT/" }
];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const gcsEnabled = () => Boolean(configuredBucketName());

// ─── HTTP ─────────────────────────────────────────────────────────────────────

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

// ─── HTML / TEXT EXTRACTION ───────────────────────────────────────────────────

function extractCasesFromHtml(html, courtLabel) {
  const cases = [];
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

function extractTextFromHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

function extractSummaryFromText(text) {
  const lines = text.split("\n\n").filter(l => l.trim().length > 80);
  return (lines[0] || text.slice(0, 600)).slice(0, 600).trim();
}

function generateCitation(courtId, year, caseNumber) {
  const courtCodes = {
    zacc: "ZACC", zasca: "ZASCA", zagpjhc: "ZAGPJHC", zagpphc: "ZAGPPHC",
    zawchc: "ZAWCHC", zakzdhc: "ZAKZDHC", zafshc: "ZAFSHC",
    zalcc: "ZALCC", zalac: "ZALAC", zact: "ZACT"
  };
  return `[${year}] ${courtCodes[courtId] || courtId.toUpperCase()} ${caseNumber}`;
}

function extractTagsFromTitle(title) {
  const tags = [];
  const t = title.toLowerCase();

  if (t.includes("constitution") || t.includes("right"))                     tags.push("constitutional");
  if (t.includes("contract") || t.includes("agreement"))                     tags.push("contract law");
  if (t.includes("property") || t.includes("transfer") || t.includes("deed")) tags.push("property law");
  if (t.includes("employ") || t.includes("labour") || t.includes("dismissal")) tags.push("employment");
  if (t.includes("company") || t.includes("director") || t.includes("share")) tags.push("company law");
  if (t.includes("criminal") || t.includes("murder") || t.includes("robbery")) tags.push("criminal");
  if (t.includes("divorce") || t.includes("marriage") || t.includes("custody")) tags.push("family law");
  if (t.includes("tax") || t.includes("sars") || t.includes("revenue"))      tags.push("tax");
  if (t.includes("bank") || t.includes("credit") || t.includes("nca"))       tags.push("banking");
  if (t.includes("negligence") || t.includes("delict") || t.includes("damages")) tags.push("delict");

  return [...new Set(tags)];
}

// ─── GCS ──────────────────────────────────────────────────────────────────────

async function uploadCaseToGcs(courtId, year, caseNumber, html) {
  const base = `${GCS_PREFIX}/${courtId}/${year}/${safeObjectPart(caseNumber)}`;
  const plainText = extractTextFromHtml(html);

  const [htmlResult, txtResult] = await Promise.all([
    uploadBuffer({
      buffer: Buffer.from(html, "utf8"),
      contentType: "text/html",
      objectName: `${base}.html`,
      metadata: { source: "saflii", court: courtId, year: String(year), caseNumber }
    }),
    uploadBuffer({
      buffer: Buffer.from(plainText, "utf8"),
      contentType: "text/plain",
      objectName: `${base}.txt`,
      metadata: { source: "saflii", court: courtId, year: String(year), caseNumber }
    })
  ]);

  return { gcsUri: txtResult.gcsUri, gcsHtmlUri: htmlResult.gcsUri };
}

// ─── INDEXER ──────────────────────────────────────────────────────────────────

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

async function indexCourt({ id: courtId, label: courtLabel, path, limitPerYear = 50, yearsBack = 5 }) {
  const sourceId = await ensureSourceRecord(courtId.toLowerCase(), courtLabel);
  const currentYear = new Date().getFullYear();
  let totalIndexed = 0;

  console.info(`[saflii] Indexing ${courtLabel} (${courtId})...`);
  if (gcsEnabled()) {
    console.info(`[saflii] GCS bucket: ${configuredBucketName()} — full judgments will be stored under ${GCS_PREFIX}/${courtId}/`);
  } else {
    console.warn("[saflii] GCS_BUCKET_NAME not set — PostgreSQL-only mode (no cloud storage).");
  }

  for (let year = currentYear; year >= currentYear - yearsBack; year--) {
    try {
      const listUrl = `${SAFLII_BASE}${path}${year}/`;
      console.info(`[saflii] Fetching listing: ${listUrl}`);
      const listHtml = await fetchWithRetry(listUrl);
      await delay(1500);

      const cases = extractCasesFromHtml(listHtml, courtLabel).slice(0, limitPerYear);
      console.info(`[saflii]   ${cases.length} cases found for ${year}`);

      for (const c of cases) {
        const citation = generateCitation(courtId, c.year, c.caseNumber);
        const sourceUrl = `${SAFLII_BASE}${c.path}`;

        const exists = await pool.query(
          "select id from legal_corpus_documents where source_url = $1 limit 1",
          [sourceUrl]
        );
        if (exists.rowCount) continue;

        let summary = `${courtLabel} judgment ${citation}.`;
        let fullTextSnippet = "";
        let gcsUri = null;
        let gcsHtmlUri = null;

        try {
          const caseHtml = await fetchWithRetry(sourceUrl);
          const plainText = extractTextFromHtml(caseHtml);
          summary = extractSummaryFromText(plainText);
          fullTextSnippet = plainText.slice(0, 2000);
          await delay(1000);

          if (gcsEnabled()) {
            try {
              const uploaded = await uploadCaseToGcs(courtId, c.year, c.caseNumber, caseHtml);
              gcsUri = uploaded.gcsUri;
              gcsHtmlUri = uploaded.gcsHtmlUri;
            } catch (gcsErr) {
              console.warn(`[saflii]   GCS upload failed for ${citation}: ${gcsErr.message}`);
            }
          }
        } catch (fetchErr) {
          console.warn(`[saflii]   Fetch failed for ${citation}: ${fetchErr.message}`);
        }

        const tags = extractTagsFromTitle(c.title);

        await pool.query(
          `insert into legal_corpus_documents
            (source_id, title, citation, court, decision_date, jurisdiction, document_type,
             summary, full_text_snippet, source_url, gcs_uri, gcs_html_uri, tags, year)
           values ($1,$2,$3,$4,$5,'South Africa','judgment',$6,$7,$8,$9,$10,$11,$12)
           on conflict do nothing`,
          [
            sourceId, c.title, citation, courtLabel, `${c.year}-01-01`,
            summary, fullTextSnippet, sourceUrl,
            gcsUri, gcsHtmlUri, tags, c.year
          ]
        );
        totalIndexed++;

        if (gcsUri) {
          console.info(`[saflii]   ✓ ${citation} → ${gcsUri}`);
        } else {
          console.info(`[saflii]   ✓ ${citation} (DB only)`);
        }
      }
    } catch (err) {
      console.error(`[saflii] Error indexing ${courtLabel} ${year}:`, err.message);
    }
  }

  await pool.query(
    "update legal_corpus_sources set index_status='indexed', last_indexed_at=now(), document_count=document_count+$2 where id=$1",
    [sourceId, totalIndexed]
  );

  console.info(`[saflii] ${courtLabel}: ${totalIndexed} new decisions indexed`);
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
  console.info(`[saflii] Indexing complete — ${totalNew} new documents in ${elapsed}s`);

  await pool.end().catch(() => {});
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const courtIdx = args.indexOf("--court");
  const yearsIdx = args.indexOf("--years");

  runIndexer({
    limitPerYear: limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 30,
    yearsBack:    yearsIdx >= 0 ? parseInt(args[yearsIdx + 1]) : 3,
    courtFilter:  courtIdx >= 0 ? args[courtIdx + 1] : null
  }).catch(err => {
    console.error("[saflii] Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { runIndexer, SA_COURTS };
