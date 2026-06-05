// server/notifications.js
// Transactional notification service — called from API routes after state changes.
// Sends tenant-branded emails via the platform SMTP transport and logs to notification_log.

const { pool } = require("./db");
const { sendTransactionalEmail } = require("./mailer");

async function getSmtpAndIdentity(tenantId) {
  const [smtp, identity] = await Promise.all([
    pool.query("select * from platform_smtp_settings where active = true order by updated_at desc limit 1"),
    tenantId
      ? pool.query("select from_name, from_email, reply_to, portal_signature from tenant_email_identities where tenant_id = $1", [tenantId])
      : Promise.resolve({ rows: [] })
  ]);
  return {
    smtpSettings: smtp.rows[0] ? {
      providerName: smtp.rows[0].provider_name || "LawPath SMTP",
      host: smtp.rows[0].host || "",
      port: Number(smtp.rows[0].port || 587),
      username: smtp.rows[0].username || "",
      password: smtp.rows[0].password_secret_ref || "",
      encryption: smtp.rows[0].encryption || "TLS",
      bounceEmail: smtp.rows[0].bounce_email || "",
      transactionalEnabled: Boolean(smtp.rows[0].transactional_enabled),
      systemEnabled: Boolean(smtp.rows[0].system_enabled),
      testRecipient: smtp.rows[0].test_recipient || ""
    } : null,
    tenantFromName: identity.rows[0]?.from_name || "LawPath SA",
    tenantFromEmail: identity.rows[0]?.from_email || null,
    replyTo: identity.rows[0]?.reply_to || null,
    signature: identity.rows[0]?.portal_signature || ""
  };
}

async function logNotification(tenantId, type, recipientEmail, subject, status, entityType, entityId, errorMessage) {
  await pool.query(
    `insert into notification_log (tenant_id, notification_type, recipient_email, subject, status, entity_type, entity_id, error_message, sent_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, case when $5='sent' then now() else null end)`,
    [tenantId, type, recipientEmail, subject, status, entityType || null, entityId || null, errorMessage || null]
  ).catch(err => console.error("[notifications] Failed to log:", err.message));
}

async function sendNotification({ tenantId, type, recipientEmail, subject, text, html, entityType, entityId }) {
  if (!recipientEmail) return;
  const { smtpSettings, tenantFromName, tenantFromEmail, replyTo } = await getSmtpAndIdentity(tenantId);
  if (!smtpSettings || !smtpSettings.transactionalEnabled) {
    await logNotification(tenantId, type, recipientEmail, subject, "suppressed", entityType, entityId, "SMTP not configured or disabled");
    return;
  }
  try {
    await sendTransactionalEmail({ to: recipientEmail, subject, tenantFromName, tenantFromEmail, replyTo, smtpSettings, text, html });
    await logNotification(tenantId, type, recipientEmail, subject, "sent", entityType, entityId, null);
  } catch (err) {
    await logNotification(tenantId, type, recipientEmail, subject, "failed", entityType, entityId, err.message);
    console.error(`[notifications] Failed to send ${type} to ${recipientEmail}:`, err.message);
  }
}

// ── CONVEYANCING STAGE ADVANCE ────────────────────────────────────────────────
async function notifyConveyancingStageAdvance({ tenantId, matterRef, sellerName, buyerName, stage, stageLabel, attorney }) {
  const matter = `${matterRef} — ${sellerName} → ${buyerName}`;
  const subject = `Transfer update: ${stageLabel} — ${matterRef}`;
  const text = `Dear ${sellerName},\n\nYour transfer (${matter}) has reached a new stage: ${stageLabel}.\n\nIf you have questions, please contact ${attorney || "your conveyancer"}.\n\nKind regards\nLawPath SA`;
  const html = `<p>Dear <strong>${sellerName}</strong>,</p><p>Your transfer <strong>${matter}</strong> has reached a new milestone:</p><p style="font-size:1.1em;color:#1f6f5b;font-weight:bold;">${stageLabel}</p><p>If you have any questions, please contact ${attorney || "your conveyancer"}.</p><p>Kind regards,<br/>LawPath SA</p>`;

  // Get client email from FICA or portal records
  const ficaResult = await pool.query(
    "select fc.client_name from fica_clients fc where fc.tenant_id=$1 and (lower(fc.client_name) like $2 or lower(fc.client_name) like $3) limit 1",
    [tenantId, `%${sellerName.toLowerCase().split(" ")[0]}%`, `%${buyerName.toLowerCase().split(" ")[0]}%`]
  ).catch(() => ({ rows: [] }));

  // Send to portal invitees linked to this matter
  const portalResult = await pool.query(
    "select invitee_email, invitee_name from portal_invites where tenant_id=$1 and matter_ref=$2 and status='active' limit 10",
    [tenantId, matterRef]
  ).catch(() => ({ rows: [] }));

  for (const invitee of portalResult.rows) {
    await sendNotification({ tenantId, type: "conveyancing_stage", recipientEmail: invitee.invitee_email, subject, text: text.replace(sellerName, invitee.invitee_name), html: html.replace(sellerName, invitee.invitee_name), entityType: "conveyancing_matter", entityId: null });
  }
}

// ── TRUST RECONCILIATION OVERDUE ──────────────────────────────────────────────
async function notifyTrustReconciliationOverdue({ tenantId, periodMonth }) {
  const admins = await pool.query(
    "select email, full_name from users where tenant_id=$1 and role in ('tenant_admin','billing_admin') and status='active' limit 5",
    [tenantId]
  ).catch(() => ({ rows: [] }));

  const subject = `Trust reconciliation overdue — ${periodMonth}`;
  const text = `The Section 86 trust account reconciliation for ${periodMonth} has not been submitted. Monthly reconciliation is required under the Legal Practice Act. Please reconcile via LawPath SA → Trust Account.`;
  const html = `<p><strong>Trust Reconciliation Overdue</strong></p><p>The Section 86 trust account reconciliation for <strong>${periodMonth}</strong> has not been submitted.</p><p>Monthly reconciliation is required under the Legal Practice Act. Please log in to LawPath SA and complete the reconciliation under <em>Trust Account</em>.</p>`;

  for (const admin of admins) {
    await sendNotification({ tenantId, type: "trust_reconciliation_overdue", recipientEmail: admin.email, subject, text, html, entityType: "trust_reconciliation", entityId: null });
  }
}

// ── DSR DEADLINE APPROACHING ──────────────────────────────────────────────────
async function notifyDsrDeadlineApproaching({ tenantId, requestId, requestorName, requestType, dueAt, daysLeft }) {
  const admins = await pool.query(
    "select email, full_name from users where tenant_id=$1 and role in ('tenant_admin','attorney') and status='active' limit 5",
    [tenantId]
  ).catch(() => ({ rows: [] }));

  const subject = `POPIA DSR deadline in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — ${requestorName}`;
  const text = `A ${requestType} request from ${requestorName} is due on ${new Date(dueAt).toLocaleDateString("en-ZA")} (${daysLeft} day${daysLeft === 1 ? "" : "s"}). Respond via LawPath SA → POPIA → Data Subject Requests.`;
  const html = `<p><strong>POPIA Data Subject Request Due Soon</strong></p><p>A <strong>${requestType}</strong> request from <strong>${requestorName}</strong> must be responded to by <strong>${new Date(dueAt).toLocaleDateString("en-ZA")}</strong> (${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining).</p><p>Failure to respond is a violation of Section 23 of POPIA. Log in to LawPath SA → POPIA → Data Subject Requests to respond.</p>`;

  for (const admin of admins) {
    await sendNotification({ tenantId, type: "dsr_deadline", recipientEmail: admin.email, subject, text, html, entityType: "popia_dsr", entityId: requestId });
  }
}

// ── E-SIGNATURE REQUEST SENT ──────────────────────────────────────────────────
async function notifyEsignatureRequest({ tenantId, requestId, documentTitle, signatoryEmail, signatoryName, role, expiresAt }) {
  const subject = `Signature required: ${documentTitle}`;
  const text = `Dear ${signatoryName},\n\nYou have been requested to sign a document: "${documentTitle}" as ${role}.\n\nThis request expires on ${new Date(expiresAt).toLocaleDateString("en-ZA")}.\n\nThis is an ECTA-compliant Advanced Electronic Signature process. Log in to LawPath SA to view and sign the document.\n\nKind regards\nLawPath SA`;
  const html = `<p>Dear <strong>${signatoryName}</strong>,</p><p>You have been requested to electronically sign:</p><p style="font-size:1.1em;font-weight:bold;">${documentTitle}</p><p><strong>Your role:</strong> ${role}<br/><strong>Expires:</strong> ${new Date(expiresAt).toLocaleDateString("en-ZA")}</p><p>This is an ECTA-compliant Advanced Electronic Signature (AES) process under the Electronic Communications and Transactions Act 25 of 2002.</p><p>Please log in to LawPath SA to view and sign the document.</p>`;
  await sendNotification({ tenantId, type: "esignature_request", recipientEmail: signatoryEmail, subject, text, html, entityType: "signature_request", entityId: requestId });
}

// ── STAFF INVITE ──────────────────────────────────────────────────────────────
async function notifyStaffInvite({ tenantId, inviteId, recipientEmail, recipientName, firmName, role, inviteToken, appUrl }) {
  const subject = `You have been invited to join ${firmName} on LawPath SA`;
  const acceptUrl = `${appUrl || "https://lawpath.co.za"}/invite?token=${inviteToken}`;
  const text = `Dear ${recipientName},\n\n${firmName} has invited you to join their LawPath SA workspace as ${role.replace(/_/g, " ")}.\n\nAccept your invitation: ${acceptUrl}\n\nThis invitation expires in 72 hours.\n\nLawPath SA`;
  const html = `<p>Dear <strong>${recipientName}</strong>,</p><p><strong>${firmName}</strong> has invited you to join their LawPath SA workspace as <strong>${role.replace(/_/g, " ")}</strong>.</p><p><a href="${acceptUrl}" style="display:inline-block;background:#1f6f5b;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Accept invitation</a></p><p>This invitation expires in 72 hours.</p>`;
  await sendNotification({ tenantId, type: "staff_invite", recipientEmail, subject, text, html, entityType: "staff_invite", entityId: inviteId });
}

// ── SCHEDULED CHECKS (called from a cron or on-boot) ─────────────────────────
async function runScheduledNotificationChecks() {
  try {
    // Check for overdue trust reconciliations (previous month not submitted)
    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStr = prevMonth.toISOString().slice(0, 7);

    const overdueRecons = await pool.query(
      `select distinct ta.tenant_id from trust_accounts ta
       where ta.active = true
       and not exists (
         select 1 from trust_reconciliations tr
         where tr.trust_account_id = ta.id and tr.period_month = $1
         and tr.status in ('Submitted','LPC Approved')
       )`,
      [prevMonthStr]
    ).catch(() => ({ rows: [] }));

    for (const row of overdueRecons.rows) {
      await notifyTrustReconciliationOverdue({ tenantId: row.tenant_id, periodMonth: prevMonthStr });
    }

    // Check for DSR requests due within 7 days
    const urgentDsrs = await pool.query(
      `select id, tenant_id, requestor_name, request_type, due_at,
              extract(day from due_at - now())::int as days_left
       from popia_dsr_requests
       where status in ('Received','In Progress')
       and due_at > now()
       and due_at < now() + interval '8 days'`
    ).catch(() => ({ rows: [] }));

    for (const dsr of urgentDsrs.rows) {
      await notifyDsrDeadlineApproaching({
        tenantId: dsr.tenant_id, requestId: dsr.id,
        requestorName: dsr.requestor_name, requestType: dsr.request_type,
        dueAt: dsr.due_at, daysLeft: Number(dsr.days_left)
      });
    }

    console.info(`[notifications] Scheduled checks complete. Recons: ${overdueRecons.rows.length}, DSRs: ${urgentDsrs.rows.length}`);
  } catch (err) {
    console.error("[notifications] Scheduled check error:", err.message);
  }
}

module.exports = {
  notifyConveyancingStageAdvance,
  notifyTrustReconciliationOverdue,
  notifyDsrDeadlineApproaching,
  notifyEsignatureRequest,
  notifyStaffInvite,
  runScheduledNotificationChecks,
  sendNotification
};
