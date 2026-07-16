// server/whatsapp-client.js
// HTTP client for the WhatsApp bridge (server/whatsapp-bridge.js). Exposes the
// same five functions index.js has always called on whatsapp-session.js, so
// moving the sessions out of the API process changes one require line.
//
// Failure posture: the bridge being down must degrade, not break. Status reads
// report a disconnected session with a telling errorMessage (the UI's Connect
// tab shows it); init/send throw, which the endpoints already turn into error
// responses — and the send endpoint falls back to Meta Cloud API / simulation
// exactly as it does for an unlinked session.

const BASE = process.env.WHATSAPP_BRIDGE_URL
  || `http://127.0.0.1:${process.env.WHATSAPP_BRIDGE_PORT || "3080"}`;
const TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN || process.env.SESSION_SECRET;

const BRIDGE_DOWN_MSG = "WhatsApp bridge is not running (pm2 start lawpath-whatsapp-bridge).";

async function call(method, path, body, timeoutMs) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `bridge responded ${res.status}`);
  return data;
}

async function getSessionStatus(tenantId) {
  try {
    return await call("GET", `/session/${tenantId}/status`, null, 10000);
  } catch (err) {
    const down = err.name === "TimeoutError" || /fetch failed|ECONNREFUSED/i.test(err.message);
    return {
      status: "disconnected",
      qrDataUrl: null,
      phoneNumber: null,
      displayName: null,
      connectedAt: null,
      errorMessage: down ? BRIDGE_DOWN_MSG : err.message
    };
  }
}

async function initSession(tenantId) {
  try {
    return await call("POST", `/session/${tenantId}/init`, {}, 15000);
  } catch (err) {
    if (err.name === "TimeoutError" || /fetch failed|ECONNREFUSED/i.test(err.message)) {
      throw new Error(BRIDGE_DOWN_MSG);
    }
    throw err;
  }
}

async function disconnectSession(tenantId) {
  try {
    await call("POST", `/session/${tenantId}/disconnect`, {}, 15000);
  } catch (err) {
    // Disconnecting a session on a dead bridge is a no-op, not an error.
    if (!(err.name === "TimeoutError" || /fetch failed|ECONNREFUSED/i.test(err.message))) throw err;
  }
}

async function sendMessage(tenantId, phoneNumber, message) {
  // Sends can be slow (Chrome + WhatsApp Web round-trip) — generous timeout.
  const data = await call("POST", `/session/${tenantId}/send`, { phoneNumber, message }, 45000);
  return data.providerMsgId || null;
}

// Sessions live in the bridge process now; it resumes its own on boot.
async function resumePersistedSessions() {}

module.exports = { initSession, getSessionStatus, disconnectSession, sendMessage, resumePersistedSessions };
