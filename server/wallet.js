// server/wallet.js
// Prepaid search wallet — firms buy search credit from us, we buy from the
// search providers, the margin (040) is ours.
//
// Two rules hold this together and neither is optional:
//
//   1. THE BALANCE IS NEVER WRITTEN WITHOUT ITS LEDGER ROW, in one transaction,
//      with the wallet row locked. Every balance is therefore re-derivable from
//      the ledger, which is what makes it auditable — a firm recharges these
//      amounts to its clients as disbursements.
//   2. A DEBIT THAT CANNOT BE AFFORDED STILL HAPPENS if the provider already
//      charged us. We record the debt (a negative balance) rather than losing
//      it. Affordability is checked BEFORE the provider is called; this is the
//      belt-and-braces case where two searches raced.

// Loaded here as well as in index.js so a script (or a test) can require this
// module directly without the database config being absent.
require("dotenv").config();
const { pool } = require("./db");

const DEFAULT_LOW_BALANCE_CENTS = 20000; // R200

/** Read a wallet, creating it on first use so nothing has to handle absence. */
async function getWallet(tenantId) {
  await pool.query(
    "insert into tenant_search_wallets (tenant_id) values ($1) on conflict (tenant_id) do nothing",
    [tenantId]
  );
  const r = await pool.query(
    `select tenant_id, balance_cents, low_balance_threshold_cents, low_balance_notified_at
     from tenant_search_wallets where tenant_id = $1`,
    [tenantId]
  );
  const row = r.rows[0];
  return {
    tenantId,
    balanceCents: Number(row?.balance_cents ?? 0),
    lowBalanceThresholdCents: Number(row?.low_balance_threshold_cents ?? DEFAULT_LOW_BALANCE_CENTS),
    lowBalanceNotifiedAt: row?.low_balance_notified_at ?? null
  };
}

/** Is wallet enforcement switched on platform-wide? Off until firms can pay. */
async function isEnforced() {
  const r = await pool.query("select enforce_search_wallet from platform_pricing_config where id = 1")
    .catch(() => ({ rows: [] }));
  return Boolean(r.rows[0]?.enforce_search_wallet);
}

/** Can this tenant afford `amountCents` right now? Returns why not, if not. */
async function checkAffordable(tenantId, amountCents) {
  const [wallet, enforced] = await Promise.all([getWallet(tenantId), isEnforced()]);
  const affordable = wallet.balanceCents >= amountCents;
  return {
    ok: affordable || !enforced,
    enforced,
    affordable,
    balanceCents: wallet.balanceCents,
    shortfallCents: Math.max(0, amountCents - wallet.balanceCents)
  };
}

/** Apply a signed movement inside one transaction, with the wallet row locked.
 *  Positive credits, negative debits. Returns the new balance. */
async function postEntry({ tenantId, entryType, amountCents, description, searchId = null, paymentRef = null, createdBy = null }) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Create-if-missing inside the transaction so a first-ever movement cannot
    // race with wallet creation.
    await client.query(
      "insert into tenant_search_wallets (tenant_id) values ($1) on conflict (tenant_id) do nothing",
      [tenantId]
    );
    const locked = await client.query(
      "select balance_cents from tenant_search_wallets where tenant_id = $1 for update",
      [tenantId]
    );
    const before = Number(locked.rows[0].balance_cents);
    const after = before + amountCents;

    await client.query(
      `update tenant_search_wallets
          set balance_cents = $2,
              updated_at = now(),
              -- A top-up re-arms the low-balance warning, so the next depletion
              -- warns again instead of staying silent.
              low_balance_notified_at = case when $3 > 0 then null else low_balance_notified_at end
        where tenant_id = $1`,
      [tenantId, after, amountCents]
    );
    const entry = await client.query(
      `insert into tenant_search_wallet_ledger
         (tenant_id, entry_type, amount_cents, balance_after_cents, search_id, payment_ref, description, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id, created_at`,
      [tenantId, entryType, amountCents, after, searchId, paymentRef, description, createdBy]
    );
    await client.query("commit");
    return { balanceCents: after, previousBalanceCents: before, entryId: entry.rows[0].id };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Charge a completed search. The provider has already billed us by this point,
 *  so this must record the debt even if it takes the wallet negative. */
async function debitForSearch({ tenantId, searchId, amountCents, description, createdBy }) {
  if (!amountCents) return null;
  return postEntry({
    tenantId, entryType: "search", amountCents: -Math.abs(amountCents),
    description, searchId, createdBy
  });
}

/** Credit a paid top-up. Idempotent on paymentRef: the unique index means a
 *  replayed webhook raises a duplicate-key error instead of paying twice. */
async function creditTopup({ tenantId, amountCents, paymentRef, description, createdBy }) {
  if (!(amountCents > 0)) throw new Error("Top-up amount must be positive.");
  if (!paymentRef) throw new Error("Top-up requires a payment reference.");
  try {
    return await postEntry({
      tenantId, entryType: "topup", amountCents: Math.abs(amountCents),
      description: description || "Search credit top-up", paymentRef, createdBy
    });
  } catch (err) {
    if (err.code === "23505") {           // unique_violation on payment_ref
      return { duplicate: true, ...(await getWallet(tenantId)) };
    }
    throw err;
  }
}

/** A manual correction by a platform super admin (goodwill, refund, write-off). */
async function adjust({ tenantId, amountCents, description, createdBy }) {
  if (!amountCents) throw new Error("Adjustment must be non-zero.");
  return postEntry({
    tenantId, entryType: amountCents > 0 ? "adjustment" : "adjustment",
    amountCents, description, createdBy
  });
}

async function getLedger(tenantId, limit = 50) {
  const r = await pool.query(
    `select l.*, u.full_name as created_by_name, s.service, s.input_ref
       from tenant_search_wallet_ledger l
       left join users u on u.id = l.created_by
       left join matter_searches s on s.id = l.search_id
      where l.tenant_id = $1
      order by l.created_at desc
      limit $2`,
    [tenantId, Math.min(limit, 200)]
  );
  return r.rows.map(row => ({
    id: row.id,
    entryType: row.entry_type,
    amountCents: Number(row.amount_cents),
    balanceAfterCents: Number(row.balance_after_cents),
    description: row.description,
    service: row.service || null,
    inputRef: row.input_ref || null,
    paymentRef: row.payment_ref || null,
    createdByName: row.created_by_name || null,
    createdAt: new Date(row.created_at).toISOString()
  }));
}

/** True when this debit just took the wallet across the warning line — the
 *  crossing, not merely being below it, so one warning per depletion. */
function justCrossedLowBalance(wallet, movement) {
  if (!movement) return false;
  const threshold = wallet.lowBalanceThresholdCents;
  return movement.previousBalanceCents >= threshold
      && movement.balanceCents < threshold
      && !wallet.lowBalanceNotifiedAt;
}

async function markLowBalanceNotified(tenantId) {
  await pool.query(
    "update tenant_search_wallets set low_balance_notified_at = now(), updated_at = now() where tenant_id = $1",
    [tenantId]
  ).catch(() => {});
}

module.exports = {
  getWallet,
  isEnforced,
  checkAffordable,
  debitForSearch,
  creditTopup,
  adjust,
  getLedger,
  justCrossedLowBalance,
  markLowBalanceNotified,
  DEFAULT_LOW_BALANCE_CENTS
};
