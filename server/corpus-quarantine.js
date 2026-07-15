// server/corpus-quarantine.js
// Move corpus documents that cannot name themselves out of the live corpus.
//
// Usage:
//   node server/corpus-quarantine.js                    # dry run (default)
//   node server/corpus-quarantine.js --commit           # move them
//   node server/corpus-quarantine.js --list             # past runs
//   node server/corpus-quarantine.js --restore <run_id> # put a run back
//
// Dry-run by default and never deletes: rows are moved to
// legal_corpus_quarantine (migration 032) and can be restored exactly.
//
// WHAT IT TARGETS: rows with no citation AND no source_url AND no frbr_uri —
// i.e. nothing that could ever identify the judgment. See 031/032 for how they
// got there. The 504 curated seeds carry a citation and a real SAFLII URL, so
// they do not match and are not touched.

require("dotenv").config();

const { pool } = require("./db");
const crypto = require("crypto");

// The predicate, in one place, used identically by the dry run and the commit.
// All three must be absent. A row with a citation is verifiable; a row with a
// source_url can be repaired. A row with none of the three is anonymous prose.
const UNNAMEABLE = `
  citation  is null
  and source_url is null
  and frbr_uri   is null
`;

const REASON = "no citation, no source_url, no frbr_uri — identity discarded by the pre-031 indexer and not recoverable from the text";

// The columns to carry across, read from the live schema so this keeps working
// if legal_corpus_documents gains a column later.
//
// Generated columns are excluded (is_generated = 'ALWAYS'). content_tsv is the
// FTS vector from migration 010, derived from title/summary/full_text_snippet:
// Postgres rejects an explicit insert into it ("cannot insert a non-DEFAULT
// value into column content_tsv") and recomputes it on restore anyway. The
// quarantine table does not reproduce it as generated — LIKE ... INCLUDING
// DEFAULTS does not copy generation expressions — so the move would silently
// succeed and only the restore would fail, which is the worst possible place to
// discover it.
async function copyableColumns(client) {
  const { rows } = await client.query(`
    select column_name from information_schema.columns
     where table_name = 'legal_corpus_documents'
       and is_generated = 'NEVER'
     order by ordinal_position`);
  return rows.map(c => `"${c.column_name}"`).join(", ");
}

async function report() {
  const { rows: [t] } = await pool.query(`
    select count(*)::int as total,
           count(*) filter (where ${UNNAMEABLE})::int as unnameable,
           count(*) filter (where not (${UNNAMEABLE}))::int as keeping
      from legal_corpus_documents`);

  console.info("CORPUS");
  console.info(`  total                ${t.total}`);
  console.info(`  to quarantine        ${t.unnameable}`);
  console.info(`  remaining after      ${t.keeping}`);

  if (!t.unnameable) return t;

  const { rows: dup } = await pool.query(`
    select count(distinct md5(coalesce(full_text_snippet,'')))::int as distinct_texts
      from legal_corpus_documents where ${UNNAMEABLE}`);
  console.info(`  (those ${t.unnameable} rows hold ${dup[0].distinct_texts} distinct texts)`);

  const { rows: byCourt } = await pool.query(`
    select coalesce(court,'(none)') as court, count(*)::int as n
      from legal_corpus_documents where ${UNNAMEABLE}
     group by 1 order by 2 desc limit 12`);
  console.info("\n  BY COURT (as guessed by the old indexer — not reliable)");
  for (const r of byCourt) console.info(`    ${String(r.n).padStart(5)}  ${r.court}`);

  const { rows: keep } = await pool.query(`
    select coalesce(court,'(none)') as court, count(*)::int as n
      from legal_corpus_documents where not (${UNNAMEABLE})
     group by 1 order by 2 desc limit 12`);
  console.info("\n  WHAT REMAINS (every row citable and linked)");
  for (const r of keep) console.info(`    ${String(r.n).padStart(5)}  ${r.court}`);

  return t;
}

async function commit() {
  const runId = crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "insert into legal_corpus_quarantine_runs (run_id, reason) values ($1, $2)",
      [runId, REASON]
    );

    const list = await copyableColumns(client);

    const moved = await client.query(`
      insert into legal_corpus_quarantine (${list}, quarantine_run_id, quarantine_reason)
      select ${list}, $1, $2 from legal_corpus_documents where ${UNNAMEABLE}`,
      [runId, REASON]);

    const deleted = await client.query(`delete from legal_corpus_documents where ${UNNAMEABLE}`);

    if (moved.rowCount !== deleted.rowCount) {
      throw new Error(`moved ${moved.rowCount} but deleted ${deleted.rowCount} — rolling back`);
    }

    await client.query("update legal_corpus_quarantine_runs set rows_moved = $2 where run_id = $1",
      [runId, moved.rowCount]);
    await client.query("commit");

    console.info(`\nQuarantined ${moved.rowCount} rows.`);
    console.info(`Run id: ${runId}`);
    console.info(`Restore with: node server/corpus-quarantine.js --restore ${runId}`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function restore(runId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: [run] } = await client.query(
      "select * from legal_corpus_quarantine_runs where run_id = $1", [runId]);
    if (!run) throw new Error(`no such run: ${runId}`);
    if (run.restored_at) throw new Error(`run ${runId} was already restored at ${run.restored_at}`);

    const list = await copyableColumns(client);

    const back = await client.query(`
      insert into legal_corpus_documents (${list})
      select ${list} from legal_corpus_quarantine where quarantine_run_id = $1`, [runId]);
    await client.query("delete from legal_corpus_quarantine where quarantine_run_id = $1", [runId]);
    await client.query("update legal_corpus_quarantine_runs set restored_at = now() where run_id = $1", [runId]);
    await client.query("commit");
    console.info(`Restored ${back.rowCount} rows from run ${runId}.`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function list() {
  const { rows } = await pool.query(`
    select r.run_id, r.rows_moved, r.created_at, r.restored_at,
           (select count(*)::int from legal_corpus_quarantine q where q.quarantine_run_id = r.run_id) as held
      from legal_corpus_quarantine_runs r order by r.created_at desc`);
  if (!rows.length) return console.info("No quarantine runs.");
  for (const r of rows) {
    console.info(`${r.run_id}  moved=${r.rows_moved}  held=${r.held}  ${r.created_at.toISOString().slice(0,16)}` +
      (r.restored_at ? `  RESTORED ${r.restored_at.toISOString().slice(0,16)}` : ""));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const restoreIdx = args.indexOf("--restore");

  if (args.includes("--list")) { await list(); return; }

  if (restoreIdx >= 0) {
    const id = args[restoreIdx + 1];
    if (!id) throw new Error("--restore needs a run id (see --list)");
    await restore(id);
    return;
  }

  const t = await report();

  if (args.includes("--commit")) {
    if (!t.unnameable) return console.info("\nNothing to quarantine.");
    await commit();
  } else {
    console.info("\nDRY RUN — nothing moved. Re-run with --commit to move these rows.");
  }
}

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch(err => { console.error("Failed:", err.message); pool.end(); process.exit(1); });
}

module.exports = { UNNAMEABLE, REASON };
