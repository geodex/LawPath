// server/searchworks.js
// SearchWorks (searchworks.co.za) Deeds Office data + DOTS tracking wrapper.
//
// SCAFFOLD — base URL, auth header, and request/response shapes are PLACEHOLDERS
// to be replaced once SearchWorks supplies the onboarding pack. The public
// surface (function signatures, usage logging, error handling) is stable; only
// the inner HTTPS plumbing should change.
//
// Spec checklist to confirm with SearchWorks before going live:
//   [ ] Production base URL                  → set SEARCHWORKS_BASE_URL
//   [ ] Sandbox/UAT base URL (if any)        → set SEARCHWORKS_SANDBOX_URL
//   [ ] Auth scheme (Bearer / API-Key / OAuth) → adjust authHeader()
//   [ ] Endpoint paths for each service       → swap PATHS map
//   [ ] Request body / query-param shape      → adjust each method's params
//   [ ] Response JSON keys (results, meta)    → adjust result parsing
//   [ ] Error envelope (code/message/details) → adjust error handling
//   [ ] Per-call metered cost (cents)         → set CREDIT_COST or read from response
//   [ ] Balance/credits endpoint (if any)     → implement getBalance()
//
// Auth: stored in platform_api_provider_settings (provider = 'searchworks')
// via Super Admin → Settings → API Keys, or SEARCHWORKS_API_KEY in .env.

require("dotenv").config();
const https = require("https");
const { pool } = require("./db");

// ─── Configuration (override via env when spec lands) ────────────────────────

const BASE_URL = process.env.SEARCHWORKS_BASE_URL || "https://api.searchworks.co.za/v1";

// Placeholder paths — swap to actual once spec is in.
const PATHS = {
  "deeds-search":         "/deeds/search",
  "property-history":     "/property/history",
  "document-retrieval":   "/documents/retrieve",
  "dots-track":           "/dots/track",
  "dots-alert-subscribe": "/dots/alerts/subscribe",
  "property-info":        "/property/info"
};

// Per-service Rand-cent cost (rough estimate vs WinDeed pricing).
// Replace with values from the SearchWorks pricing schedule.
const CREDIT_COST = {
  "deeds-search":         2567,   // R25.67
  "property-history":     2567,
  "document-retrieval":   5000,
  "dots-track":           2567,
  "dots-alert-subscribe": 25785,  // R257.85 (30-day auto-renew tier)
  "property-info":        2000
};

// ─── HTTPS helpers (Node built-in, same pattern as server/lightstone.js) ────

function httpsRequest({ method, url, headers, body, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port:     u.port || 443,
      path:     u.pathname + u.search,
      method,
      headers
    };
    const req = https.request(options, (res) => {
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
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ─── Auth + DB ────────────────────────────────────────────────────────────────

async function getApiKey() {
  const result = await pool.query(
    "select api_key_secret_ref from platform_api_provider_settings where provider = 'searchworks' and active = true limit 1"
  );
  const dbKey = result.rows[0]?.api_key_secret_ref;
  const key   = (dbKey && dbKey.trim()) ? dbKey.trim() : (process.env.SEARCHWORKS_API_KEY || "").trim();
  if (!key) {
    const err = new Error(
      "SearchWorks API key not configured. " +
      "Add your key in Super Admin → Settings → API Keys (provider: searchworks), " +
      "or set SEARCHWORKS_API_KEY in .env."
    );
    err.statusCode = 503;
    err.expose = true;
    throw err;
  }
  return key;
}

// Adjust this once SearchWorks confirms whether they use Bearer, X-API-Key,
// or another header. Default to Bearer (the common case).
function authHeader(apiKey) {
  return { "Authorization": `Bearer ${apiKey}` };
}

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

// ─── Low-level call + logging ────────────────────────────────────────────────

async function call({ service, method = "POST", body = null, query = null, ctx = {}, inputRef = null }) {
  const path = PATHS[service];
  if (!path) {
    const err = new Error(`Unknown SearchWorks service: ${service}`);
    err.statusCode = 400;
    err.expose = true;
    throw err;
  }
  const apiKey = await getApiKey();

  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const headers = {
    ...authHeader(apiKey),
    "Accept": "application/json"
  };
  if (body) headers["Content-Type"] = "application/json";

  const fullUrl = url.toString();
  console.info(`[searchworks] ${method} ${fullUrl}`);

  const start = Date.now();
  let result;
  try {
    result = await httpsRequest({ method, url: fullUrl, headers, body });
  } catch (netErr) {
    await logUsage({ ...ctx, service, inputRef, creditsSpent: 0, latencyMs: Date.now() - start, status: "error", errorCode: "network_error" });
    throw Object.assign(new Error("SearchWorks API unreachable: " + netErr.message), { statusCode: 503, expose: true });
  }

  const latencyMs = Date.now() - start;
  if (!result.ok) {
    const code = String(result.statusCode);
    console.error(`[searchworks] ${code} from ${fullUrl} — body: ${result.raw?.slice(0, 500)}`);
    await logUsage({ ...ctx, service, inputRef, creditsSpent: 0, latencyMs, status: "error", errorCode: code });
    const msg =
      result.statusCode === 401 ? "SearchWorks API key is invalid or missing." :
      result.statusCode === 403 ? "SearchWorks API key is not authorised for this service." :
      result.statusCode === 404 ? "SearchWorks: no record matched the input." :
      result.statusCode === 429 ? "SearchWorks rate limit exceeded — please retry shortly." :
      result.statusCode >= 500  ? "SearchWorks backend error. Try again or contact SearchWorks support." :
      (result.json?.message || result.json?.error || `SearchWorks error ${result.statusCode}`);
    throw Object.assign(new Error(msg), { statusCode: result.statusCode, expose: true });
  }

  // Response shape varies per service; common pattern is {results, count, meta}.
  // Adjust once SearchWorks confirms canonical shape.
  const payload = result.json;
  const resultCount = Array.isArray(payload?.results) ? payload.results.length
                    : Array.isArray(payload)         ? payload.length
                    : payload?.results ? 1
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

  return payload;
}

// ─── Public service methods ──────────────────────────────────────────────────

/** Deeds Office search — by erf/title-deed/owner/address. */
async function deedsSearch(input, ctx = {}) {
  return call({
    service: "deeds-search",
    method: "POST",
    body: input,
    ctx,
    inputRef: input?.erfNumber || input?.titleDeedNumber || input?.ownerName || input?.address || null
  });
}

/** Property ownership history — current + previous owners across estates and schemes. */
async function propertyHistory(input, ctx = {}) {
  return call({
    service: "property-history",
    method: "POST",
    body: input,
    ctx,
    inputRef: input?.propertyId || input?.erfNumber || input?.ownerIdNumber || null
  });
}

/** Document retrieval — fetch deed PDF/document by reference (T/B/BC/ST/SBC/SB/I/H). */
async function documentRetrieval(input, ctx = {}) {
  return call({
    service: "document-retrieval",
    method: "POST",
    body: input,
    ctx,
    inputRef: input?.documentReference || input?.deedNumber || null
  });
}

/** DOTS — Deeds Office Tracking System: real-time pending registration status. */
async function dotsTrack(input, ctx = {}) {
  return call({
    service: "dots-track",
    method: "POST",
    body: input,
    ctx,
    inputRef: input?.trackingReference || input?.matterReference || null
  });
}

/** DOTS alert subscription — email notifications on Deeds Office status change. */
async function dotsAlertSubscribe(input, ctx = {}) {
  return call({
    service: "dots-alert-subscribe",
    method: "POST",
    body: input,
    ctx,
    inputRef: input?.trackingReference || null
  });
}

/** Generic property info lookup. */
async function propertyInfo(input, ctx = {}) {
  return call({
    service: "property-info",
    method: "POST",
    body: input,
    ctx,
    inputRef: input?.propertyId || input?.erfNumber || null
  });
}

// Map service strings to handler functions for the tenant proxy route.
const SERVICE_HANDLERS = {
  "deeds-search":         deedsSearch,
  "property-history":     propertyHistory,
  "document-retrieval":   documentRetrieval,
  "dots-track":           dotsTrack,
  "dots-alert-subscribe": dotsAlertSubscribe,
  "property-info":        propertyInfo
};

const SERVICES = Object.keys(SERVICE_HANDLERS);

module.exports = {
  deedsSearch,
  propertyHistory,
  documentRetrieval,
  dotsTrack,
  dotsAlertSubscribe,
  propertyInfo,
  SERVICE_HANDLERS,
  SERVICES
};
