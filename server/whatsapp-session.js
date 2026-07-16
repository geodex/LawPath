// server/whatsapp-session.js
// WhatsApp Web QR-scan session manager using whatsapp-web.js.
//
// Design: one session per tenant, stored in ./whatsapp-sessions/{tenantId}/.
// Each session runs a headless Chromium instance. On Ubuntu this requires:
//   sudo apt-get install -y chromium-browser
//   # Or let Puppeteer bundle its own Chrome (default, ~300MB download on first run)
//
// Message use: notifications only (appointment reminders, matter updates, payment
// reminders). Confidential legal content must remain on email per professional norms.

const path = require("path");
const qrcode = require("qrcode");
const { pool } = require("./db");

// Lazy-require whatsapp-web.js so the server still starts if the package is missing
let WWebJS = null;
function getWWebJS() {
  if (!WWebJS) {
    try { WWebJS = require("whatsapp-web.js"); } catch { return null; }
  }
  return WWebJS;
}

const SESSIONS_DIR = path.join(process.cwd(), "whatsapp-sessions");

// In-memory session registry
// Map<tenantId, { client, status, qrDataUrl, phoneNumber, displayName, connectedAt }>
const sessions = new Map();

async function storeInboundMessage(tenantId, from, body, msgId) {
  try {
    const phoneNumber = from.replace("@c.us", "").replace(/^(\d{1,2})(\d{9,10})$/, (_, cc, local) => `+${cc}${local}`);
    // Upsert contact
    const contact = await pool.query(
      "insert into whatsapp_contacts (tenant_id, client_name, phone_number, opt_in, opt_in_date) values ($1,$2,$3,true,now()) on conflict (tenant_id, phone_number) do update set opt_in=true returning id",
      [tenantId, phoneNumber, phoneNumber]
    ).catch(() => ({ rows: [] }));
    const contactId = contact.rows[0]?.id || null;
    await pool.query(
      "insert into whatsapp_messages (tenant_id, contact_id, direction, message_body, status, provider_msg_id) values ($1,$2,'inbound',$3,'read',$4) on conflict do nothing",
      [tenantId, contactId, body, msgId]
    ).catch(() => {});
  } catch (err) {
    console.error("[wa-session] Failed to store inbound message:", err.message);
  }
}

async function updateMessageStatus(msgId, status) {
  if (!msgId) return;
  const dbStatus = status === "DELIVERY_ACK" ? "delivered" : status === "READ" ? "read" : null;
  if (dbStatus) {
    await pool.query("update whatsapp_messages set status=$2 where provider_msg_id=$1", [msgId, dbStatus]).catch(() => {});
  }
}

/**
 * Initialise a WhatsApp Web session for a tenant.
 * Returns the session object immediately; connection is async.
 */
async function initSession(tenantId) {
  const lib = getWWebJS();
  if (!lib) throw new Error("whatsapp-web.js is not installed. Run: npm install whatsapp-web.js");

  // Return existing session if already initialising or ready
  if (sessions.has(tenantId)) {
    const existing = sessions.get(tenantId);
    if (["qr", "authenticated", "ready", "initializing"].includes(existing.status)) {
      return existing;
    }
    // Stale disconnected session — destroy and recreate
    try { await existing.client?.destroy(); } catch {}
  }

  const session = {
    client: null,
    status: "initializing",
    qrDataUrl: null,
    phoneNumber: null,
    displayName: null,
    connectedAt: null,
    tenantId
  };
  sessions.set(tenantId, session);

  const { Client, LocalAuth } = lib;

  // Detect system Chrome/Chromium — tried in order of preference.
  //
  // Google Chrome (.deb) FIRST, snap chromium LAST: on Ubuntu 22.04
  // /usr/bin/chromium-browser is a snap shim that passes the test -x probe and
  // then refuses to launch from a service context ("/system.slice/... is not a
  // snap cgroup") — the exact failure seen in production. A real Chrome binary
  // has no snap confinement. Same technique as the working Briza Watch bridge:
  //   wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  //   sudo dpkg -i google-chrome-stable_current_amd64.deb && sudo apt install -f -y
  const { execSync } = require("child_process");
  const CHROME_CANDIDATES = [
    process.env.PUPPETEER_EXECUTABLE_PATH,        // env override
    "/usr/bin/google-chrome-stable",              // Google Chrome (.deb — preferred)
    "/usr/bin/google-chrome",                     // Google Chrome alt
    "/usr/local/bin/chromium",                    // custom install
    "/usr/bin/chromium",                          // Debian/Fedora apt (real binary)
    "/usr/bin/chromium-browser",                  // Ubuntu — snap shim, breaks under services
    "/snap/bin/chromium",                         // Ubuntu snap — same
  ].filter(Boolean);

  let executablePath;
  for (const candidate of CHROME_CANDIDATES) {
    try {
      execSync(`test -x "${candidate}"`, { stdio: "ignore" });
      executablePath = candidate;
      console.info(`[wa-session] Using Chrome: ${executablePath}`);
      break;
    } catch {}
  }

  if (!executablePath) {
    console.warn("[wa-session] No system Chrome found — falling back to Puppeteer bundled Chrome.");
  }

  // The flag set the working Briza Watch bridge runs with, plus --disable-gpu.
  // Deliberately NOT --single-process/--no-zygote: those are container
  // workarounds that crash modern Chrome at launch on a normal host.
  const puppeteerConfig = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  };
  if (executablePath) puppeteerConfig.executablePath = executablePath;

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `tenant-${tenantId}`,
      dataPath: SESSIONS_DIR
    }),
    puppeteer: puppeteerConfig
  });

  session.client = client;

  client.on("qr", async (qr) => {
    try {
      session.qrDataUrl = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
      session.status = "qr";
      console.info(`[wa-session] QR ready for tenant ${tenantId}`);
    } catch (err) {
      console.error("[wa-session] QR generation error:", err.message);
    }
  });

  client.on("authenticated", () => {
    session.status = "authenticated";
    session.qrDataUrl = null;
    console.info(`[wa-session] Authenticated for tenant ${tenantId}`);
  });

  client.on("ready", () => {
    session.status = "ready";
    session.qrDataUrl = null;
    session.connectedAt = new Date().toISOString();
    const info = client.info || {};
    session.phoneNumber = info.wid?.user ? `+${info.wid.user}` : null;
    session.displayName = info.pushname || info.me?.pushname || null;
    console.info(`[wa-session] Ready — tenant ${tenantId}, number: ${session.phoneNumber}`);
  });

  client.on("auth_failure", (msg) => {
    console.error(`[wa-session] Auth failure for tenant ${tenantId}:`, msg);
    session.status = "auth_failure";
    sessions.delete(tenantId);
  });

  client.on("disconnected", (reason) => {
    console.info(`[wa-session] Disconnected — tenant ${tenantId}:`, reason);
    session.status = "disconnected";
    sessions.delete(tenantId);
  });

  // Inbound message — notifications only; store for the tenant
  client.on("message", async (msg) => {
    if (msg.fromMe) return;
    if (msg.type !== "chat") return; // text only
    await storeInboundMessage(tenantId, msg.from, msg.body, msg.id?.id);
  });

  // Delivery/read receipts
  client.on("message_ack", async (msg, ack) => {
    const status = ack === 2 ? "DELIVERY_ACK" : ack === 3 ? "READ" : null;
    if (status) await updateMessageStatus(msg.id?.id, status);
  });

  // Initialise asynchronously — don't await so endpoint returns immediately
  client.initialize().catch(err => {
    const msg = err.message || String(err);
    console.error(`[wa-session] Init error for tenant ${tenantId}:`, msg);

    // Helpful hints for common failures
    if (msg.includes("executablePath") || msg.includes("Chrome") || msg.includes("Chromium") || msg.includes("ENOENT")) {
      console.error("[wa-session] Chrome not found. Install with: sudo apt-get install -y chromium-browser");
      console.error("[wa-session] Or set PUPPETEER_EXECUTABLE_PATH=/path/to/chrome in .env");
    }
    if (msg.includes("Running as root") || msg.includes("sandbox")) {
      console.error("[wa-session] Sandbox error. The --no-sandbox flag should fix this — check puppeteerConfig.args.");
    }
    if (msg.includes("shared memory") || msg.includes("dev/shm")) {
      console.error("[wa-session] Shared memory error. --disable-dev-shm-usage is set — may need tmpfs increase.");
    }

    session.status = "error";
    session.errorMessage = msg;
    sessions.delete(tenantId);
  });

  return session;
}

function getSession(tenantId) {
  return sessions.get(tenantId) || null;
}

function getSessionStatus(tenantId) {
  const session = sessions.get(tenantId);
  if (!session) return { status: "disconnected", qrDataUrl: null, phoneNumber: null, displayName: null, connectedAt: null, errorMessage: null };
  return {
    status: session.status,
    qrDataUrl: session.qrDataUrl,
    phoneNumber: session.phoneNumber,
    displayName: session.displayName,
    connectedAt: session.connectedAt,
    errorMessage: session.errorMessage || null
  };
}

async function disconnectSession(tenantId) {
  const session = sessions.get(tenantId);
  if (!session) return;
  try {
    await session.client?.logout();
    await session.client?.destroy();
  } catch {}
  sessions.delete(tenantId);
  console.info(`[wa-session] Disconnected and logged out tenant ${tenantId}`);
}

async function sendMessage(tenantId, phoneNumber, message) {
  const session = sessions.get(tenantId);
  if (!session || session.status !== "ready") {
    throw new Error("WhatsApp not connected. Scan the QR code in WhatsApp → Connect tab.");
  }
  // Convert +27821234567 → 27821234567@c.us
  const chatId = phoneNumber.replace(/\+/g, "").replace(/\s/g, "") + "@c.us";
  const result = await session.client.sendMessage(chatId, message);
  return result?.id?.id || null;
}

// Attempt to resume persisted sessions on server start
async function resumePersistedSessions() {
  const lib = getWWebJS();
  if (!lib) return;
  try {
    const fs = require("fs");
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const dirs = fs.readdirSync(SESSIONS_DIR).filter(d => d.startsWith("tenant-"));
    for (const dir of dirs) {
      const tenantId = dir.replace("tenant-", "");
      console.info(`[wa-session] Resuming session for tenant ${tenantId}`);
      initSession(tenantId).catch(err => console.error(`[wa-session] Resume error:`, err.message));
      await new Promise(r => setTimeout(r, 2000)); // stagger startup
    }
  } catch (err) {
    console.error("[wa-session] Resume error:", err.message);
  }
}

module.exports = { initSession, getSession, getSessionStatus, disconnectSession, sendMessage, resumePersistedSessions };
