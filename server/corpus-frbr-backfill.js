// server/corpus-frbr-backfill.js
// Give the curated seed rows the FRBR URI their citation already implies.
//
// Usage:
//   node server/corpus-frbr-backfill.js            # dry run (the default)
//   node server/corpus-frbr-backfill.js --commit   # write frbr_uri
//
// WHY: the 504 build-time seeds carry a real citation and a real SAFLII URL but
// no frbr_uri, because frbr_uri did not exist until migration 031. The unique
// index that stops the indexer duplicating a judgment is keyed on frbr_uri, so
// without this the fixed indexer cannot tell that the S v Makwanyane it just
// retrieved is the S v Makwanyane already seeded. You would get two rows for
// every landmark case — the 103-character seed and the 16,000-character properly
// identified one — across exactly the cases semantic search surfaces most.
//
// A citation and a work FRBR URI are the same fact in two notations:
//
//   [1995] ZACC 3   <->   /akn/za/judgment/zacc/1995/3
//
// so this is a transliteration, not an inference. Nothing is fetched and nothing
// is guessed: a citation that does not parse is left alone and reported.
//
// Once a seed has its frbr_uri, indexResult's upsert upgrades it in place the
// next time the indexer retrieves that judgment — the seed's one-line summary
// becomes the full Laws.Africa summary, its fabricated YYYY-01-01 decision_date
// becomes the real handing-down date, and its title becomes the authoritative
// one. The corpus repairs itself as it runs, at no extra API cost.

require("dotenv").config();

const { pool } = require("./db");
const { LOCALITY_BY_FRBR_CODE } = require("./saflii");

// "[1995] ZACC 3" -> { code: "zacc", year: 1995, number: "3" }
// Anchored: a citation with anything extra ("[2001] ZACC Doc 26") does not parse
// and is reported rather than coerced into a URI that would name a real but
// different judgment.
const CITATION_RE = /^\[(\d{4})\]\s+([A-Z]+)\s+(\d+)$/;

function frbrUriFromCitation(citation) {
  const m = CITATION_RE.exec(String(citation || "").trim());
  if (!m) return null;
  const code = m[2].toLowerCase();
  // Provincial High Court works live under /akn/za-<province>/...; the court
  // code implies which. National courts (absent from the map) sit under /akn/za/.
  const jurisdiction = LOCALITY_BY_FRBR_CODE[code] || "za";
  return `/akn/${jurisdiction}/judgment/${code}/${m[1]}/${m[3]}`;
}

async function main() {
  const commit = process.argv.includes("--commit");

  const { rows } = await pool.query(`
    select id, citation, title, court
      from legal_corpus_documents
     where frbr_uri is null and citation is not null
     order by year, citation`);

  const plan = [];
  const unparsable = [];
  for (const r of rows) {
    const uri = frbrUriFromCitation(r.citation);
    if (uri) plan.push({ ...r, uri });
    else unparsable.push(r);
  }

  // Two seeds implying the same URI would collide on the unique index. Detect it
  // here rather than letting the first win silently.
  const byUri = new Map();
  for (const p of plan) {
    if (!byUri.has(p.uri)) byUri.set(p.uri, []);
    byUri.get(p.uri).push(p);
  }
  const collisions = [...byUri.entries()].filter(([, v]) => v.length > 1);

  // A seed whose URI is already held by an indexed row: the indexer got there
  // first. Leave the richer row alone and report; the seed is the redundant one.
  const uris = plan.map(p => p.uri);
  const { rows: taken } = uris.length
    ? await pool.query("select frbr_uri from legal_corpus_documents where frbr_uri = any($1)", [uris])
    : { rows: [] };
  const takenSet = new Set(taken.map(t => t.frbr_uri));

  const writable = plan.filter(p => !takenSet.has(p.uri) && byUri.get(p.uri).length === 1);

  console.info("SEED FRBR BACKFILL");
  console.info(`  rows with a citation but no frbr_uri   ${rows.length}`);
  console.info(`  citation parses to a URI               ${plan.length}`);
  console.info(`  will be written                        ${writable.length}`);
  console.info(`  citation will not parse (left alone)   ${unparsable.length}`);
  console.info(`  URI already held by an indexed row     ${plan.filter(p => takenSet.has(p.uri)).length}`);
  console.info(`  two seeds imply the same URI           ${collisions.length}`);

  for (const u of unparsable.slice(0, 10)) {
    console.info(`    unparsable: ${JSON.stringify(u.citation)}  ${String(u.title).slice(0, 44)}`);
  }
  for (const [uri, v] of collisions.slice(0, 10)) {
    console.info(`    collision:  ${uri}  <- ${v.map(x => x.citation).join(" , ")}`);
  }
  if (writable.length) {
    console.info("\n  examples:");
    for (const p of writable.slice(0, 5)) {
      console.info(`    ${p.citation.padEnd(18)} -> ${p.uri}`);
    }
  }

  if (!commit) {
    console.info("\nDRY RUN — nothing written. Re-run with --commit.");
    return;
  }
  if (!writable.length) {
    console.info("\nNothing to write.");
    return;
  }

  const client = await pool.connect();
  let written = 0;
  try {
    await client.query("begin");
    for (const p of writable) {
      // Guarded on frbr_uri still being null so a re-run is a no-op, and on the
      // unique index so a race cannot produce a duplicate.
      const r = await client.query(
        "update legal_corpus_documents set frbr_uri = $2 where id = $1 and frbr_uri is null",
        [p.id, p.uri]
      );
      written += r.rowCount;
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.info(`\nWrote frbr_uri on ${written} rows.`);
  console.info("The indexer will now upgrade these in place instead of duplicating them.");
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch(err => { console.error("Failed:", err.message); pool.end(); process.exit(1); });
}

module.exports = { frbrUriFromCitation };
