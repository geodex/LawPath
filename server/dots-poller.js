// server/dots-poller.js
// Inverts the SearchWorks dots-barcode lookup: instead of an attorney manually
// checking a lodged matter, a daily sweep polls every conveyancing matter that
// carries a lodgement barcode, detects Deeds Office status movement, records it,
// and DRAFTS (never sends) a client update for attorney approval.
//
// Nothing here mutates the pipeline stage or sends a message — everything the
// firm's clients receive must stay attorney-reviewable (see product guardrails).
// Used by two callers: the daily cron (runDotsPolling) and the per-matter
// "Check now" endpoint (pollMatter).

const { pool } = require("./db");
const searchworks = require("./searchworks");

// Stages at/after lodgement — the only ones worth polling.
const POLLABLE_STAGES = ["deeds_lodgement", "deeds_registration"];

// The DOTS response schema is not strongly documented and varies by record, so
// pull the status defensively: try the obvious fields, then scan for any
// *status*/*state* string, then fall back to the top-level ResponseMessage.
function extractDotsStatus(response) {
  if (!response || typeof response !== "object") return null;
  const ro = (response.ResponseObject && typeof response.ResponseObject === "object") ? response.ResponseObject : {};

  const direct = [
    ro.Status, ro.DotsStatus, ro.LodgementStatus, ro.CurrentStatus,
    ro.DeedsStatus, ro.RegistrationStatus, ro.TrackingStatus, ro.State
  ];
  for (const c of direct) if (typeof c === "string" && c.trim()) return c.trim();

  const scan = (obj, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 3) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (/status|state/i.test(k) && typeof v === "string" && v.trim()) return v.trim();
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") { const r = scan(v, depth + 1); if (r) return r; }
    }
    return null;
  };
  const scanned = scan(ro);
  if (scanned) return scanned;

  if (typeof response.ResponseMessage === "string" && response.ResponseMessage.trim()) {
    return response.ResponseMessage.trim();
  }
  return null;
}

// Build the attorney-review draft client update. Prefer a tenant transfer_update
// WhatsApp template whose body matches the movement (registered / lodged);
// otherwise compose a plain, clearly-flagged draft.
async function draftClientUpdate({ tenantId, matterRef, sellerName, buyerName, newStatus }) {
  const isReg = /regist/i.test(newStatus);
  const isLodge = /lodg|prep|exam/i.test(newStatus);
  let tpl = null;
  try {
    const r = await pool.query(
      `select name, body from whatsapp_templates
       where (tenant_id = $1 or tenant_id is null)
         and active = true and category = 'transfer_update'
       order by (tenant_id = $1) desc, name asc
       limit 20`, [tenantId]
    );
    tpl = r.rows.find(t => isReg && /regist/i.test(`${t.name} ${t.body}`))
       || r.rows.find(t => isLodge && /lodg/i.test(`${t.name} ${t.body}`))
       || r.rows[0] || null;
  } catch { tpl = null; }

  const fill = (s) => String(s)
    .replace(/\{\{?\s*matter_?ref\s*\}?\}/gi, matterRef)
    .replace(/\{\{?\s*seller\s*\}?\}/gi, sellerName)
    .replace(/\{\{?\s*buyer\s*\}?\}/gi, buyerName)
    .replace(/\{\{?\s*status\s*\}?\}/gi, newStatus);

  const base = tpl?.body
    ? fill(tpl.body)
    : `Good day. An update on your property transfer (ref ${matterRef}, ${sellerName} → ${buyerName}): `
      + `the Deeds Office status is now "${newStatus}". We will keep you posted as the matter progresses.`;

  return `${base}\n\n[Draft — attorney to review before sending to the client.]`;
}

// Poll a single matter row. `m` must carry: id, tenant_id, matter_ref,
// seller_name, buyer_name, dots_barcode, dots_deeds_office, dots_last_status.
// Always stamps dots_last_polled_at; on a real status change also records the
// new status, the draft, resets the ack, and writes an activity_log entry.
async function pollMatter(m, { runByUserId = null } = {}) {
  const ctx = { tenantId: m.tenant_id, userId: runByUserId, feature: "dots-poll" };
  let response;
  try {
    response = await searchworks.dotsBarcode(
      { reference: m.matter_ref || "", deedsOffice: m.dots_deeds_office || "", barcode: m.dots_barcode },
      ctx
    );
  } catch (err) {
    await pool.query(
      "update conveyancing_matters set dots_last_polled_at = now() where id = $1",
      [m.id]
    );
    return { polled: true, changed: false, error: err.message };
  }

  const status = extractDotsStatus(response);
  const previous = m.dots_last_status || null;

  if (!status || status === previous) {
    await pool.query(
      "update conveyancing_matters set dots_last_polled_at = now() where id = $1",
      [m.id]
    );
    return { polled: true, changed: false, previous, status: status || previous };
  }

  const draft = await draftClientUpdate({
    tenantId: m.tenant_id, matterRef: m.matter_ref,
    sellerName: m.seller_name, buyerName: m.buyer_name, newStatus: status
  });

  await pool.query(
    `update conveyancing_matters set
       dots_last_status = $2, dots_last_polled_at = now(),
       dots_status_changed_at = now(), dots_draft_message = $3,
       dots_ack_at = null, updated_at = now()
     where id = $1`,
    [m.id, status, draft]
  );
  await pool.query(
    `insert into activity_log (tenant_id, actor_user_id, entity_type, entity_id, action, details)
     values ($1,$2,'conveyancing_matter',$3,'dots_status_changed',$4)`,
    [m.tenant_id, runByUserId, m.id, { from: previous, to: status, barcode: m.dots_barcode }]
  );

  return { polled: true, changed: true, previous, status, draft };
}

// Daily sweep across every tenant: poll each lodged matter that carries a
// barcode, oldest-polled first. Sequential to be gentle on the SearchWorks API.
async function runDotsPolling() {
  let polled = 0, changed = 0, errors = 0;
  try {
    const matters = await pool.query(
      `select id, tenant_id, matter_ref, seller_name, buyer_name,
              dots_barcode, dots_deeds_office, dots_last_status
       from conveyancing_matters
       where dots_barcode is not null and dots_barcode <> ''
         and current_stage = any($1)
       order by coalesce(dots_last_polled_at, to_timestamp(0)) asc
       limit 200`,
      [POLLABLE_STAGES]
    ).catch(() => ({ rows: [] }));

    for (const m of matters.rows) {
      const r = await pollMatter(m);
      polled++;
      if (r.error) errors++;
      else if (r.changed) changed++;
    }
    console.info(`[dots-poller] Complete. Polled ${polled}, changed ${changed}, errors ${errors}.`);
  } catch (err) {
    console.error("[dots-poller] Sweep error:", err.message);
  }
  return { polled, changed, errors };
}

module.exports = { runDotsPolling, pollMatter, extractDotsStatus, draftClientUpdate, POLLABLE_STAGES };
