// server/approvals.js
// The firm's single approval queue. Anything that leaves the firm or moves money
// is drafted here first and signed off by an admitted attorney.
//
// Shared by the API (server/index.js) and by background drafters such as the
// DOTS poller, so an AI draft lands in exactly the same queue a secretary's
// draft does — and is marked origin:'ai' so it is never mistaken for an
// attorney's own work.

const { pool } = require("./db");

const APPROVAL_KINDS = ["invoice", "document", "trust_payment", "client_message", "time_entry", "other"];

// Only admitted attorneys and the firm admin may sign off. A candidate attorney
// works under supervision; a secretary or bookkeeper approving would defeat the
// purpose of the queue.
const APPROVER_ROLES = ["tenant_admin", "attorney"];

// Never throws: a queue insert failing must not lose the caller's work.
async function createApprovalRequest({ tenantId, matterId = null, kind, title, summary = "", payload = {},
  entityType = null, entityId = null, amountCents = null, origin = "human", requestedBy = null }) {
  if (!tenantId || !APPROVAL_KINDS.includes(kind) || !title) return null;
  try {
    const r = await pool.query(
      `insert into approval_requests
        (tenant_id, matter_id, kind, title, summary, payload, entity_type, entity_id, amount_cents, origin, requested_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [tenantId, matterId, kind, String(title).slice(0, 300), summary || null, payload || {},
       entityType, entityId, amountCents, origin, requestedBy]
    );
    return r.rows[0];
  } catch (err) {
    console.warn("[approvals] could not queue request:", err.message);
    return null;
  }
}

// Is there already an undecided request covering this entity? Used to avoid
// re-queueing the same draft every time a background job runs.
async function hasPendingFor({ tenantId, entityType, entityId, kind }) {
  if (!tenantId || !entityId) return false;
  try {
    const r = await pool.query(
      `select 1 from approval_requests
        where tenant_id = $1 and entity_type = $2 and entity_id = $3 and kind = $4 and status = 'pending'
        limit 1`,
      [tenantId, entityType, entityId, kind]);
    return r.rowCount > 0;
  } catch { return false; }
}

module.exports = { createApprovalRequest, hasPendingFor, APPROVAL_KINDS, APPROVER_ROLES };
