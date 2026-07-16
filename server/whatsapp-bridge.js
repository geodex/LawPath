// server/whatsapp-bridge.js
// Standalone WhatsApp bridge — owns every tenant's whatsapp-web.js session in
// its own process, so a headless-Chrome crash (or its 200-300MB per linked
// tenant) can never take down lawpath-api, whose PM2 memory cap is 512MB.
//
// Pattern proven by the Briza Watch bridge on the same host family; adapted
// for LawPath's multi-tenant sessions. Differences from Briza's bridge:
//   - one bridge holds MANY sessions (one per tenant), same as the in-process
//     manager it replaces (whatsapp-session.js runs here unchanged);
//   - inbound messages and delivery acks are written straight to Postgres by
//     whatsapp-session.js — no webhook hop, the bridge shares the app's .env;
//   - the API talks to it through server/whatsapp-client.js, which exposes the
//     same five functions index.js always called.
//
// Runs as PM2 app "lawpath-whatsapp-bridge" (ecosystem.config.cjs), listening
// on 127.0.0.1 only. Auth: bearer WHATSAPP_BRIDGE_TOKEN (defaults to
// SESSION_SECRET so both processes agree with zero extra config).

require("dotenv").config();

const express = require("express");
const waSession = require("./whatsapp-session");

const HOST = process.env.WHATSAPP_BRIDGE_HOST || "127.0.0.1";
const PORT = parseInt(process.env.WHATSAPP_BRIDGE_PORT || "3080", 10);
const TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN || process.env.SESSION_SECRET;

if (!TOKEN) {
  console.error("[wa-bridge] Neither WHATSAPP_BRIDGE_TOKEN nor SESSION_SECRET is set — refusing to start unauthenticated.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ error: "unauthorised" });
  }
  next();
});

// Tenant ids arrive in URLs; keep them sane before they touch a filesystem path
// (LocalAuth stores sessions under whatsapp-sessions/tenant-<id>).
function tenantParam(req, res) {
  const t = String(req.params.tenantId || "");
  if (!/^[0-9a-f-]{8,64}$/i.test(t)) {
    res.status(400).json({ error: "invalid tenant id" });
    return null;
  }
  return t;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/session/:tenantId/status", (req, res) => {
  const tenantId = tenantParam(req, res);
  if (!tenantId) return;
  res.json(waSession.getSessionStatus(tenantId));
});

app.post("/session/:tenantId/init", async (req, res) => {
  const tenantId = tenantParam(req, res);
  if (!tenantId) return;
  try {
    await waSession.initSession(tenantId);
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.post("/session/:tenantId/disconnect", async (req, res) => {
  const tenantId = tenantParam(req, res);
  if (!tenantId) return;
  try {
    await waSession.disconnectSession(tenantId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/session/:tenantId/send", async (req, res) => {
  const tenantId = tenantParam(req, res);
  if (!tenantId) return;
  const { phoneNumber, message } = req.body || {};
  if (!phoneNumber || !message) {
    return res.status(400).json({ error: "phoneNumber and message are required" });
  }
  try {
    const providerMsgId = await waSession.sendMessage(tenantId, String(phoneNumber), String(message));
    res.json({ ok: true, providerMsgId });
  } catch (err) {
    // Not-connected is the caller's normal "fall back to Meta API" signal, not
    // a bridge fault — keep the message intact and the status telling.
    res.status(409).json({ error: err.message });
  }
});

app.listen(PORT, HOST, () => {
  console.info(`[wa-bridge] Listening on http://${HOST}:${PORT}`);
  // Relink every session that was connected before the restart — LocalAuth
  // persists to whatsapp-sessions/, so no re-scan is needed.
  waSession.resumePersistedSessions();
});
