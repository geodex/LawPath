// server/matter-backfill.js
// Matter spine, Phase B — best-effort backfill of matter_id. See
// docs/matter-spine-plan.md. Run manually; never wired into deploy.sh.
//
//   node server/matter-backfill.js                 # dry run (default) — writes nothing
//   node server/matter-backfill.js --commit        # apply
//   node server/matter-backfill.js --tenant <uuid> # limit to one tenant
//   node server/matter-backfill.js --rollback <run_id>
//
// Safety contract:
//   * Only ever sets matter_id WHERE matter_id IS NULL. Never rewrites, clears
//     or overwrites an existing link, and never touches any other column.
//   * Ambiguous matches (a ref/name matching more than one matter) are SKIPPED
//     and reported — never guessed.
//   * The client on a promoted matter comes from acting_for (migration 027) —
//     the attorney's explicit statement of which side the firm represents. A
//     matter with no acting_for is skipped and reported, not defaulted to one
//     side; set it in the UI and re-run to pick it up.
//   * Every write is journalled to matter_backfill_log, so --rollback undoes an
//     entire run exactly.
//   * Idempotent: a second run finds nothing left to do.

require("dotenv").config();
const crypto = require("crypto");
const { pool } = require("./db");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const val = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);

const COMMIT = flag("--commit");
const ROLLBACK_RUN = val("--rollback");
const TENANT = val("--tenant");
const DRY = !COMMIT;

const stats = [];
function record(phase, matched, skipped, note) {
  stats.push({ phase, matched, skipped, note: note || "" });
}

// Writes always execute; a dry run performs them inside the transaction and
// then ROLLBACKs. That way the reported match rates are exactly what a --commit
// would produce, including B2 linking against the spine rows B1 just created.
async function logWrite(client, runId, table, rowId, oldId, newId, matchedOn) {
  await client.query(
    `insert into matter_backfill_log (run_id, table_name, row_id, old_matter_id, new_matter_id, matched_on)
     values ($1,$2,$3,$4,$5,$6)`,
    [runId, table, String(rowId), oldId, newId, matchedOn]
  );
}

// ── B1: promote litigation/conveyancing matters into the `matters` spine ─────
// Each domain matter without a spine row gets one, keyed on (tenant_id,
// matter_number = matter_ref) which is already unique — so a re-run reuses the
// existing spine row instead of duplicating it.
async function promoteDomain(client, runId, cfg) {
  const where = TENANT ? "and tenant_id = $1" : "";
  const params = TENANT ? [TENANT] : [];
  const rows = (await client.query(
    `select * from ${cfg.table}
     where matter_id is null and matter_ref is not null and matter_ref <> '' ${where}`,
    params
  )).rows;

  let matched = 0, skipped = 0, needsActingFor = 0;
  for (const r of rows) {
    // The client is whichever party the firm acts for. That is never inferred:
    // if no attorney has stated it, the matter is left alone and reported, and a
    // later re-run picks it up once set.
    if (!r.acting_for) { needsActingFor++; continue; }
    const title = cfg.title(r);
    const clientName = cfg.clientName(r);
    if (!clientName) { skipped++; continue; }

    const ins = await client.query(
      `insert into matters (tenant_id, matter_number, title, client_name, client_role, matter_type, stage, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (tenant_id, matter_number) do nothing
       returning id`,
      [r.tenant_id, r.matter_ref, title, clientName, r.acting_for, cfg.matterType,
       r.current_stage || r.status || "Intake", r.created_by || null]
    );
    const spineId = ins.rows[0]?.id
      || (await client.query("select id from matters where tenant_id = $1 and matter_number = $2",
          [r.tenant_id, r.matter_ref])).rows[0]?.id;
    if (!spineId) { skipped++; continue; }

    await client.query(`update ${cfg.table} set matter_id = $2 where id = $1 and matter_id is null`, [r.id, spineId]);
    await logWrite(client, runId, cfg.table, r.id, null, spineId, `promoted:acting_for=${r.acting_for}`);
    matched++;
  }
  const note = needsActingFor
    ? `${needsActingFor} skipped — no "acting for" set; set it in the UI and re-run`
    : "promoted domain matters into the spine";
  record(`B1 ${cfg.table} → matters`, matched, skipped + needsActingFor, note);
}

// ── B2: link a leaf table to the spine ───────────────────────────────────────
// `joinSql` must yield exactly one matter per row (HAVING count(*) = 1), so
// ambiguous rows fall out and are counted as skipped rather than guessed.
async function linkLeaf(client, runId, cfg) {
  const tenantFilter = TENANT ? "and t.tenant_id = $1" : "";
  const params = TENANT ? [TENANT] : [];

  const unambiguous = (await client.query(
    `select t.id as row_id, min(m.id::text) as matter_id
       from ${cfg.table} t
       join matters m on m.tenant_id = t.tenant_id and ${cfg.on}
      where t.matter_id is null ${tenantFilter}
      group by t.id
     having count(distinct m.id) = 1`,
    params
  )).rows;

  const ambiguous = (await client.query(
    `select count(*)::int as n from (
       select t.id
         from ${cfg.table} t
         join matters m on m.tenant_id = t.tenant_id and ${cfg.on}
        where t.matter_id is null ${tenantFilter}
        group by t.id
       having count(distinct m.id) > 1
     ) x`,
    params
  )).rows[0]?.n || 0;

  for (const row of unambiguous) {
    await client.query(
      `update ${cfg.table} set matter_id = $2 where id = $1 and matter_id is null`,
      [row.row_id, row.matter_id]
    );
    await logWrite(client, runId, cfg.table, row.row_id, null, row.matter_id, cfg.matchedOn);
  }

  const remaining = (await client.query(
    `select count(*)::int as n from ${cfg.table} t where t.matter_id is null ${tenantFilter}`,
    params
  )).rows[0]?.n || 0;

  record(`B2 ${cfg.table} (${cfg.matchedOn})`, unambiguous.length, ambiguous,
    `${ambiguous} ambiguous skipped · ${remaining} still unlinked`);
}

async function rollback(runId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const entries = (await client.query(
      "select table_name, row_id, old_matter_id, new_matter_id, matched_on from matter_backfill_log where run_id = $1 order by id desc",
      [runId]
    )).rows;
    if (!entries.length) { console.info(`[matter-backfill] No log entries for run ${runId}.`); await client.query("rollback"); return; }

    let reverted = 0;
    const promotedSpineIds = [];
    for (const e of entries) {
      await client.query(
        `update ${e.table_name} set matter_id = $2 where id = $1 and matter_id = $3`,
        [e.row_id, e.old_matter_id, e.new_matter_id]
      );
      reverted++;
      if (String(e.matched_on).startsWith("promoted:")) promotedSpineIds.push(e.new_matter_id);
    }

    // Remove spine rows this run created, but only if nothing else now points at them.
    let removed = 0;
    for (const id of promotedSpineIds) {
      const refs = await client.query(
        `select
           (select count(*) from time_entries        where matter_id = $1) +
           (select count(*) from trust_transactions  where matter_id = $1) +
           (select count(*) from fica_clients        where matter_id = $1) +
           (select count(*) from document_analyses   where matter_id = $1) +
           (select count(*) from invoices            where matter_id = $1) +
           (select count(*) from litigation_matters  where matter_id = $1) +
           (select count(*) from conveyancing_matters where matter_id = $1) as n`, [id]
      );
      if (Number(refs.rows[0]?.n || 0) === 0) {
        const d = await client.query("delete from matters where id = $1", [id]);
        removed += d.rowCount;
      }
    }

    await client.query("delete from matter_backfill_log where run_id = $1", [runId]);
    await client.query("commit");
    console.info(`[matter-backfill] Rolled back run ${runId}: ${reverted} links reverted, ${removed} promoted spine rows removed.`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  if (ROLLBACK_RUN) return rollback(ROLLBACK_RUN);

  const runId = crypto.randomUUID();
  const client = await pool.connect();
  console.info(`[matter-backfill] ${DRY ? "DRY RUN — nothing will be written" : "COMMIT"} · run ${runId}${TENANT ? ` · tenant ${TENANT}` : " · all tenants"}`);

  try {
    await client.query("begin");

    // The client is resolved from acting_for (migration 027) — the attorney's
    // explicit statement of which side the firm represents. Never guessed.
    await promoteDomain(client, runId, {
      table: "litigation_matters",
      matterType: "litigation",
      title: (r) => `${r.plaintiff} v ${r.defendant}`.slice(0, 300),
      clientName: (r) => (r.acting_for === "plaintiff" ? r.plaintiff : r.defendant) || null
    });

    await promoteDomain(client, runId, {
      table: "conveyancing_matters",
      matterType: "conveyancing",
      title: (r) => `${r.seller_name} → ${r.buyer_name}`.slice(0, 300),
      clientName: (r) => (r.acting_for === "seller" ? r.seller_name
                        : r.acting_for === "buyer" ? r.buyer_name
                        : r.bond_bank) || null
    });

    await linkLeaf(client, runId, {
      table: "time_entries",
      on: "t.matter_ref is not null and t.matter_ref <> '' and lower(trim(t.matter_ref)) = lower(trim(m.matter_number))",
      matchedOn: "matter_ref=matter_number"
    });

    await linkLeaf(client, runId, {
      table: "trust_transactions",
      on: "t.reference is not null and t.reference <> '' and lower(trim(t.reference)) = lower(trim(m.matter_number))",
      matchedOn: "reference=matter_number"
    });

    await linkLeaf(client, runId, {
      table: "fica_clients",
      on: "t.client_name is not null and t.client_name <> '' and lower(trim(t.client_name)) = lower(trim(m.client_name))",
      matchedOn: "client_name=client_name"
    });

    // document_analyses carries no reliable key (only file_name / parties[]), so
    // it is reported rather than guessed — link these from the Matter File UI.
    const daLeft = (await client.query(
      `select count(*)::int as n from document_analyses t where t.matter_id is null ${TENANT ? "and t.tenant_id = $1" : ""}`,
      TENANT ? [TENANT] : []
    )).rows[0]?.n || 0;
    record("B2 document_analyses (not auto-linked)", 0, daLeft, "no reliable key — link from the Matter File UI");

    if (DRY) await client.query("rollback");
    else await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  console.info("\n  phase                                        matched  skipped  note");
  console.info("  " + "-".repeat(96));
  for (const s of stats) {
    console.info(`  ${s.phase.padEnd(44)} ${String(s.matched).padStart(7)}  ${String(s.skipped).padStart(7)}  ${s.note}`);
  }
  console.info("");
  if (DRY) {
    console.info("[matter-backfill] DRY RUN complete — no changes were written. Re-run with --commit to apply.");
  } else {
    console.info(`[matter-backfill] Committed. Roll back with:\n  node server/matter-backfill.js --rollback ${runId}`);
  }
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error("[matter-backfill] Error:", err.message);
    pool.end().finally(() => process.exit(1));
  });
