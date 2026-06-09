// server/lightstone.js
// Lightstone Property API wrapper — search, property detail, owners, legal & more.
// Portal: https://portal.apis.lightstone.co.za
//
// Three API products used:
//   lspsearch          (Property-Search)          GET /address?query=…
//   lspsearch-internal (Property-Search-Internal) GET /address/{id}/associatedSectionalSchemeUnitsBySchemeGroupId
//   lspdata            (Property-Data)            GET /property/{id}/owners|legal|municipal|land|aivm|…
//
// Auth: single header — Ocp-Apim-Subscription-Key (same key across all three products)
//   Stored in platform_api_provider_settings (provider = 'lightstone') via
//   Super Admin → Settings → API Keys, or LIGHTSTONE_SUBSCRIPTION_KEY in .env.
//
// Every call is logged to lightstone_usage_log for audit and billing monitoring.
//
// Uses Node's built-in `https` module so it works on any Node version ≥ 12
// (no dependency on global fetch or AbortSignal.timeout which require Node 18+).

require("dotenv").config();
const https  = require("https");
const { pool } = require("./db");

// ─── Low-level HTTPS GET (Node built-in, no fetch required) ──────────────────

function httpsGet(urlStr, headers, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const url    = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port:     url.port || 443,
      path:     url.pathname + url.search,
      method:   "GET",
      headers
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = {}; }
        resolve({ statusCode: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json, raw });
      });
    });

    req.on("error", reject);

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Lightstone request timed out after ${timeoutMs}ms`));
    });

    req.end();
  });
}

const BASES = {
  search:   "https://apis.lightstone.co.za/lspsearch/v1",
  internal: "https://apis.lightstone.co.za/lspsearch-internal/v1",
  data:     "https://apis.lightstone.co.za/lspdata/v1"
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getApiKey() {
  // Prefer DB-stored key (managed through Super Admin UI).
  const result = await pool.query(
    "select api_key_secret_ref from platform_api_provider_settings where provider = 'lightstone' and active = true limit 1"
  );
  const dbKey = result.rows[0]?.api_key_secret_ref;
  const key   = (dbKey && dbKey.trim()) ? dbKey.trim() : (process.env.LIGHTSTONE_SUBSCRIPTION_KEY || "").trim();

  if (!key) {
    const err = new Error(
      "Lightstone API key not configured. " +
      "Add your Ocp-Apim-Subscription-Key in Super Admin → Settings → API Keys (provider: lightstone), " +
      "or set LIGHTSTONE_SUBSCRIPTION_KEY in .env."
    );
    err.statusCode = 503;
    err.expose = true;
    throw err;
  }
  return key;
}

async function logUsage({ tenantId, userId, service, latencyMs, status, errorCode, resultCount }) {
  try {
    await pool.query(
      `insert into lightstone_usage_log
         (tenant_id, user_id, service, latency_ms, status, error_code, result_count)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        tenantId   ?? null,
        userId     ?? null,
        service,
        latencyMs  ?? null,
        status,
        errorCode  ?? null,
        resultCount ?? null
      ]
    );
  } catch (err) {
    console.warn("[lightstone] Usage logging failed:", err.message);
  }
}

/** Low-level authenticated GET with logging */
async function apiGet({ base, path, params = {}, ctx = {} }) {
  const apiKey = await getApiKey();

  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const fullUrl = url.toString();
  console.info(`[lightstone] GET ${fullUrl}`);

  const start = Date.now();
  let result;

  try {
    result = await httpsGet(fullUrl, {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Accept": "application/json",
      "Cache-Control": "no-cache"
    });
  } catch (netErr) {
    await logUsage({ ...ctx, service: path, latencyMs: Date.now() - start, status: "error", errorCode: "network_error" });
    throw Object.assign(
      new Error("Lightstone API unreachable: " + netErr.message),
      { statusCode: 503, expose: true }
    );
  }

  const latencyMs = Date.now() - start;
  const payload   = result.json;

  if (!result.ok) {
    const code = String(result.statusCode);
    console.error(`[lightstone] ${code} from ${fullUrl} — body: ${result.raw?.slice(0, 500)}`);
    await logUsage({ ...ctx, service: path, latencyMs, status: "error", errorCode: code });
    const activityId = payload?.activityId ? ` (activityId: ${payload.activityId})` : "";
    const msg =
      result.statusCode === 401 ? "Lightstone subscription key is invalid or missing." :
      result.statusCode === 403 ? "Lightstone subscription key is not authorised for this API product. Check portal.apis.lightstone.co.za → Profile → Subscriptions." :
      result.statusCode === 402 ? "Lightstone quota exhausted or endpoint not associated with your contract." :
      result.statusCode === 429 ? "Lightstone rate limit exceeded — please retry shortly." :
      result.statusCode === 500 ? `Lightstone backend error${activityId}. Try the operation in the portal's "Try it" console to confirm. Contact Lightstone support with the activityId if it fails there too.` :
      (payload?.message || `Lightstone error ${result.statusCode}`) + activityId;
    throw Object.assign(new Error(msg), { statusCode: result.statusCode, expose: true });
  }

  return { payload, latencyMs };
}

// ─── Public API Methods ───────────────────────────────────────────────────────

/**
 * Address search — Property-Search API.
 * Returns up to ~10 matching addresses ranked by relevanceScore.
 *
 * @param {string} query  Free-text address query (street number, suburb, erf, etc.)
 * @param {object} ctx    { tenantId, userId } for usage logging
 */
async function searchAddress(query, ctx = {}) {
  if (!query || !query.trim()) {
    return { searchIdentifier: null, results: [] };
  }
  const { payload, latencyMs } = await apiGet({
    base: BASES.search,
    path: "/address",
    params: { query: query.trim() },
    ctx
  });

  const results = Array.isArray(payload.results) ? payload.results : [];
  await logUsage({ ...ctx, service: "lspsearch/address", latencyMs, status: "success", resultCount: results.length });

  return {
    searchIdentifier: payload.searchIdentifier ?? null,
    results // native Lightstone PropertyAddressSingleLineResponse[]
  };
}

/**
 * Sectional scheme units — Property-Search-Internal API.
 * Returns units belonging to a sectional scheme identified by addressId
 * (the `id` field from a search result where schemeGroupId > 0).
 *
 * @param {number} addressId  The `id` from a PropertyAddressSingleLineResponse
 * @param {number} maxrows    Maximum results to return (default 20, max 100)
 * @param {object} ctx        { tenantId, userId }
 */
async function getSectionalUnits(addressId, maxrows = 20, ctx = {}) {
  const { payload, latencyMs } = await apiGet({
    base: BASES.internal,
    path: `/address/${addressId}/associatedSectionalSchemeUnitsBySchemeGroupId`,
    params: { maxrows: Math.min(Number(maxrows) || 20, 100) },
    ctx
  });

  // Lightstone returns array directly or wrapped in .results
  const units = Array.isArray(payload) ? payload
    : Array.isArray(payload.results) ? payload.results
    : [];

  await logUsage({ ...ctx, service: "lspsearch-internal/sectional", latencyMs, status: "success", resultCount: units.length });
  return { units };
}

// ─── Property Data API (lspdata/v1) ──────────────────────────────────────────
// All methods take propertyId (integer from search result .propertyId field)
// except getAddressDetail which takes addressId (.id from search result).

/** Address and Spatial Details — lspdata/v1/address/{id}/address */
async function getAddressDetail(addressId, ctx = {}) {
  const { payload, latencyMs } = await apiGet({ base: BASES.data, path: `/address/${addressId}/address`, ctx });
  await logUsage({ ...ctx, service: "lspdata/address/detail", latencyMs, status: "success" });
  return payload;
}

/** Property address details by propertyId — lspdata/v1/property/{id}/address */
async function getPropertyAddress(propertyId, ctx = {}) {
  const { payload, latencyMs } = await apiGet({ base: BASES.data, path: `/property/${propertyId}/address`, ctx });
  await logUsage({ ...ctx, service: "lspdata/property/address", latencyMs, status: "success" });
  return payload;
}

/**
 * Registered owners — lspdata/v1/property/{id}/owners
 * Returns an array of current registered owner(s) with identity details.
 * This is the primary Windeed-replacement call for conveyancing.
 */
async function getPropertyOwners(propertyId, ctx = {}) {
  const { payload, latencyMs } = await apiGet({ base: BASES.data, path: `/property/${propertyId}/owners`, ctx });
  await logUsage({ ...ctx, service: "lspdata/property/owners", latencyMs, status: "success" });
  // Lightstone may return array directly or wrapped
  return Array.isArray(payload) ? payload : (payload.owners || payload.results || payload);
}

/**
 * Legal / title deed data — lspdata/v1/property/{id}/legal
 * Contains title deed number, registration date, purchase price, bond info.
 */
async function getPropertyLegal(propertyId, ctx = {}) {
  const { payload, latencyMs } = await apiGet({ base: BASES.data, path: `/property/${propertyId}/legal`, ctx });
  await logUsage({ ...ctx, service: "lspdata/property/legal", latencyMs, status: "success" });
  return payload;
}

/**
 * Municipal data — lspdata/v1/property/{id}/municipal
 * Contains municipal valuation, monthly rates, account number.
 */
async function getPropertyMunicipal(propertyId, ctx = {}) {
  const { payload, latencyMs } = await apiGet({ base: BASES.data, path: `/property/${propertyId}/municipal`, ctx });
  await logUsage({ ...ctx, service: "lspdata/property/municipal", latencyMs, status: "success" });
  return payload;
}

/**
 * Land details — lspdata/v1/property/{id}/land
 * Contains erf/lot number, extent (m²), land use, zoning.
 */
async function getPropertyLand(propertyId, ctx = {}) {
  const { payload, latencyMs } = await apiGet({ base: BASES.data, path: `/property/${propertyId}/land`, ctx });
  await logUsage({ ...ctx, service: "lspdata/property/land", latencyMs, status: "success" });
  return payload;
}

/**
 * AI Valuation Model — lspdata/v1/property/{id}/aivm
 * Automated market value estimate with confidence band.
 */
async function getPropertyValuation(propertyId, ctx = {}) {
  const { payload, latencyMs } = await apiGet({ base: BASES.data, path: `/property/${propertyId}/aivm`, ctx });
  await logUsage({ ...ctx, service: "lspdata/property/aivm", latencyMs, status: "success" });
  return payload;
}

/**
 * Fetch the core property detail bundle in parallel:
 * owners + legal + municipal + land + address.
 * Returns a single object with each section keyed separately.
 * Individual sections that fail (e.g. not in subscription) return null rather than throwing.
 */
async function getPropertyBundle(propertyId, addressId, ctx = {}) {
  const safe = fn => fn.catch(err => {
    console.warn(`[lightstone] bundle partial failure: ${err.message}`);
    return null;
  });

  const [address, owners, legal, municipal, land] = await Promise.all([
    addressId ? safe(getAddressDetail(addressId, ctx))    : null,
    safe(getPropertyOwners(propertyId, ctx)),
    safe(getPropertyLegal(propertyId, ctx)),
    safe(getPropertyMunicipal(propertyId, ctx)),
    safe(getPropertyLand(propertyId, ctx))
  ]);

  return { address, owners, legal, municipal, land };
}

module.exports = {
  searchAddress,
  getSectionalUnits,
  getAddressDetail,
  getPropertyAddress,
  getPropertyOwners,
  getPropertyLegal,
  getPropertyMunicipal,
  getPropertyLand,
  getPropertyValuation,
  getPropertyBundle
};
