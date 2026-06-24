// server/searchworks.js
// SearchWorks (searchworks.co.za) Deeds Office data + DOTS tracking wrapper.
//
// Auth pattern (confirmed from doccentral.searchworks.co.za):
//   POST /auth/login/  body: {Username, Password}    → returns SessionToken
//   Every API call POSTs JSON with SessionToken IN THE BODY (not a header).
//   POST /auth/logout/ body: {SessionToken}
//   POST /auth/validatetoken/ body: {SessionToken}
//
// Spec checklist still to confirm:
//   [x] Auth scheme — session token in body (confirmed)
//   [x] UAT base URL — uatrest.searchworks.co.za (confirmed)
//   [ ] Production base URL — likely rest.searchworks.co.za, confirm with SearchWorks
//   [x] /commtest/, /auth/*, /billingreports/*, /deedsoffice/crossdeeds/person/
//   [ ] Deeds search by property/erf/title-deed paths
//   [ ] Property history paths
//   [ ] Document retrieval paths
//   [ ] DOTS tracking + alert paths
//   [ ] Per-call ZAR cost from SearchWorks pricing schedule
//
// Credentials are stored in platform_api_provider_settings.api_key_secret_ref
// as JSON: {"username":"...","password":"..."} — set via Super Admin Settings UI.

require("dotenv").config();
const https = require("https");
const { pool } = require("./db");

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = process.env.SEARCHWORKS_BASE_URL || "https://uatrest.searchworks.co.za";

// Endpoint paths (all SearchWorks paths end with a trailing slash).
const PATHS = {
  // Auth
  "login":            "/auth/login/",
  "logout":           "/auth/logout/",
  "validate-token":   "/auth/validatetoken/",
  "search-limit":     "/auth/GetSearchLimitDetails/",
  // Diagnostic
  "commtest":         "/commtest/",
  // Billing reports
  "billing-branch":   "/billingreports/branch/",
  "billing-company":  "/billingreports/company/",
  // Deeds Office searches
  "deeds-cross-person": "/deedsoffice/crossdeeds/person/"
  // TODO: add the remaining deeds, property history, document retrieval,
  // DOTS track, and DOTS alert paths once confirmed from doccentral docs.
};

// Per-service Rand-cent cost (placeholder — replace with real pricing schedule).
const CREDIT_COST = {
  "commtest":            0,
  "billing-branch":      0,
  "billing-company":     0,
  "deeds-cross-person":  2567,    // R25.67 (WinDeed comparable)
  "deeds-search":        2567,
  "property-history":    2567,
  "document-retrieval":  5000,
  "dots-track":          2567,
  "dots-alert-subscribe": 25785,  // R257.85 30-day auto-renew
  "property-info":       2000
};

// ─── HTTPS helper ───────────────────────────────────────────────────────────

function httpsPost(url, jsonBody, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(jsonBody || {});
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = {}; }
        resolve({ statusCode: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json, raw });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`SearchWorks request timed out after ${timeoutMs}ms`)));
    req.write(body);
    req.end();
  });
}

// ─── Credentials + session token cache ──────────────────────────────────────

async function getCredentials() {
  const result = await pool.query(
    "select api_key_secret_ref from platform_api_provider_settings where provider = 'searchworks' and active = true limit 1"
  );
  const raw = (result.rows[0]?.api_key_secret_ref || "").trim();
  let username = "";
  let password = "";
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      username = (parsed.username || "").trim();
      password = (parsed.password || "").trim();
    } catch { /* fall through to env */ }
  }
  if (!username) username = (process.env.SEARCHWORKS_USERNAME || "").trim();
  if (!password) password = (process.env.SEARCHWORKS_PASSWORD || "").trim();
  if (!username || !password) {
    const err = new Error(
      "SearchWorks credentials not configured. " +
      "Add Username + Password in Super Admin → Settings → API Keys (provider: searchworks), " +
      "or set SEARCHWORKS_USERNAME and SEARCHWORKS_PASSWORD in .env."
    );
    err.statusCode = 503;
    err.expose = true;
    throw err;
  }
  return { username, password };
}

// In-memory session token cache. Lost on process restart (cheap to re-login).
// Keyed by username to support credential rotation without a restart.
const sessionCache = new Map(); // username → { token, fetchedAt }

const SESSION_TTL_MS = 50 * 60 * 1000; // assume tokens stay valid 50 minutes; re-login on 401 regardless

async function loginAndCacheToken({ username, password }) {
  const url = BASE_URL + PATHS["login"];
  console.info(`[searchworks] POST ${url} (login as ${username})`);
  const res = await httpsPost(url, { Username: username, Password: password });
  if (!res.ok) {
    const msg = res.json?.Message || res.json?.message || res.raw?.slice(0, 200) || `HTTP ${res.statusCode}`;
    throw Object.assign(new Error(`SearchWorks login failed: ${msg}`), {
      statusCode: res.statusCode === 401 ? 401 : 502,
      expose: true
    });
  }
  // The login response shape is per-doc; we accept several common key spellings.
  const token = res.json?.SessionToken || res.json?.sessionToken || res.json?.Token || res.json?.token;
  if (!token) {
    throw Object.assign(new Error("SearchWorks login returned no SessionToken."), { statusCode: 502, expose: true });
  }
  sessionCache.set(username, { token, fetchedAt: Date.now() });
  return token;
}

async function getSessionToken({ forceRefresh = false } = {}) {
  const creds = await getCredentials();
  if (!forceRefresh) {
    const cached = sessionCache.get(creds.username);
    if (cached && Date.now() - cached.fetchedAt < SESSION_TTL_MS) return cached.token;
  }
  return loginAndCacheToken(creds);
}

function invalidateSession(username) {
  if (username) sessionCache.delete(username);
  else sessionCache.clear();
}

// ─── Usage logging ──────────────────────────────────────────────────────────

async function logUsage({ tenantId, userId, service, inputRef, creditsSpent, latencyMs, status, errorCode, resultCount }) {
  try {
    await pool.query(
      `insert into searchworks_usage_log
         (tenant_id, user_id, service, input_ref, credits_spent, latency_ms, status, error_code, result_count)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tenantId ?? null,
        userId   ?? null,
        service,
        inputRef ?? null,
        Number(creditsSpent || 0),
        latencyMs ?? null,
        status,
        errorCode ?? null,
        resultCount ?? null
      ]
    );
  } catch (err) {
    console.warn("[searchworks] Usage logging failed:", err.message);
  }
}

// ─── Generic call wrapper ──────────────────────────────────────────────────
// Every SearchWorks call POSTs JSON with SessionToken in the body.
// On 401 we transparently re-login once and retry.

async function call({ service, body = {}, ctx = {}, inputRef = null, skipAuth = false, _retried = false }) {
  const path = PATHS[service];
  if (!path) {
    const err = new Error(`Unknown SearchWorks service: ${service}`);
    err.statusCode = 400;
    err.expose = true;
    throw err;
  }

  let sessionToken = null;
  if (!skipAuth) sessionToken = await getSessionToken();

  const url = BASE_URL + path;
  const payload = skipAuth ? body : { SessionToken: sessionToken, ...body };

  console.info(`[searchworks] POST ${url} (service=${service})`);

  const start = Date.now();
  let res;
  try {
    res = await httpsPost(url, payload);
  } catch (netErr) {
    await logUsage({ ...ctx, service, inputRef, creditsSpent: 0, latencyMs: Date.now() - start, status: "error", errorCode: "network_error" });
    throw Object.assign(new Error("SearchWorks API unreachable: " + netErr.message), { statusCode: 503, expose: true });
  }
  const latencyMs = Date.now() - start;

  // 401 → token expired, re-login once and retry.
  if (res.statusCode === 401 && !skipAuth && !_retried) {
    console.warn(`[searchworks] 401 from ${url} — re-logging in and retrying`);
    invalidateSession();
    return call({ service, body, ctx, inputRef, _retried: true });
  }

  if (!res.ok) {
    const code = String(res.statusCode);
    console.error(`[searchworks] ${code} from ${url} — body: ${res.raw?.slice(0, 500)}`);
    await logUsage({ ...ctx, service, inputRef, creditsSpent: 0, latencyMs, status: "error", errorCode: code });
    const msg =
      res.statusCode === 401 ? "SearchWorks authentication failed (session expired or invalid credentials)." :
      res.statusCode === 403 ? "SearchWorks: account not authorised for this service." :
      res.statusCode === 404 ? "SearchWorks: no record matched the input." :
      res.statusCode === 429 ? "SearchWorks rate limit exceeded — please retry shortly." :
      res.statusCode >= 500  ? "SearchWorks backend error. Try again or contact SearchWorks support." :
      (res.json?.Message || res.json?.message || res.json?.error || `SearchWorks error ${res.statusCode}`);
    throw Object.assign(new Error(msg), { statusCode: res.statusCode, expose: true });
  }

  const payloadOut = res.json;
  const resultCount = Array.isArray(payloadOut?.Results) ? payloadOut.Results.length
                    : Array.isArray(payloadOut?.results) ? payloadOut.results.length
                    : Array.isArray(payloadOut) ? payloadOut.length
                    : 0;

  await logUsage({
    ...ctx,
    service,
    inputRef,
    creditsSpent: CREDIT_COST[service] || 0,
    latencyMs,
    status: "success",
    resultCount
  });
  return payloadOut;
}

// ─── Public service methods ────────────────────────────────────────────────

/** Diagnostic — verify connectivity (no auth required). */
async function commtest(ctx = {}) {
  return call({ service: "commtest", body: { testParam: "lawpath-ping" }, ctx, skipAuth: true });
}

/** Validate the cached session token (auto-renews on 401 via the call wrapper). */
async function validateToken(ctx = {}) {
  return call({ service: "validate-token", body: {}, ctx });
}

/** Get the current search-limit / credits state for the SearchWorks account. */
async function getSearchLimit(ctx = {}) {
  return call({ service: "search-limit", body: {}, ctx });
}

/** Billing report by branch — body: {DateFrom, DateTo} */
async function billingByBranch(input, ctx = {}) {
  return call({
    service: "billing-branch",
    body: { DateFrom: input?.dateFrom || "", DateTo: input?.dateTo || "" },
    ctx,
    inputRef: `${input?.dateFrom || ""}..${input?.dateTo || ""}`
  });
}

/** Billing report by company — body: {DateFrom, DateTo} */
async function billingByCompany(input, ctx = {}) {
  return call({
    service: "billing-company",
    body: { DateFrom: input?.dateFrom || "", DateTo: input?.dateTo || "" },
    ctx,
    inputRef: `${input?.dateFrom || ""}..${input?.dateTo || ""}`
  });
}

/**
 * Cross deeds-office search by person — searches multiple deeds offices for a
 * person's property/title-deed history.
 * input: {Reference, DeedsOfficeIDs, IDNumber, Firstname, Surname, Sequestration}
 */
async function deedsCrossPerson(input, ctx = {}) {
  return call({
    service: "deeds-cross-person",
    body: {
      Reference:      input?.reference      || input?.Reference      || "",
      DeedsOfficeIDs: input?.deedsOfficeIDs || input?.DeedsOfficeIDs || "",
      IDNumber:       input?.idNumber       || input?.IDNumber       || "",
      Firstname:      input?.firstname      || input?.Firstname      || "",
      Surname:        input?.surname        || input?.Surname        || "",
      Sequestration:  String(input?.sequestration ?? input?.Sequestration ?? "false")
    },
    ctx,
    inputRef: input?.idNumber || input?.surname || input?.IDNumber || input?.Surname || null
  });
}

// ─── Service handler map (used by the tenant proxy in server/index.js) ──────

const SERVICE_HANDLERS = {
  "commtest":           commtest,
  "validate-token":     validateToken,
  "search-limit":       getSearchLimit,
  "billing-branch":     billingByBranch,
  "billing-company":    billingByCompany,
  "deeds-cross-person": deedsCrossPerson
  // TODO: add deeds-by-property, property-history, document-retrieval,
  // dots-track, dots-alert-subscribe as those endpoints are confirmed.
};

const SERVICES = Object.keys(SERVICE_HANDLERS);

module.exports = {
  // service methods
  commtest,
  validateToken,
  getSearchLimit,
  billingByBranch,
  billingByCompany,
  deedsCrossPerson,
  // proxy support
  SERVICE_HANDLERS,
  SERVICES,
  // session management (exposed for tests / debugging)
  invalidateSession,
  getSessionToken
};
