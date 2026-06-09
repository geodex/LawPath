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

require("dotenv").config();
const { pool } = require("./db");

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

  const start = Date.now();
  let response, payload;

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Accept": "application/json",
        "Cache-Control": "no-cache"
      },
      signal: AbortSignal.timeout(12000)
    });
    payload = await response.json().catch(() => ({}));
  } catch (netErr) {
    await logUsage({ ...ctx, service: path, latencyMs: Date.now() - start, status: "error", errorCode: "network_error" });
    throw Object.assign(
      new Error("Lightstone API unreachable: " + netErr.message),
      { statusCode: 503, expose: true }
    );
  }

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const code = String(response.status);
    await logUsage({ ...ctx, service: path, latencyMs, status: "error", errorCode: code });
    const msg =
      response.status === 401 ? "Lightstone subscription key is invalid or missing." :
      response.status === 402 ? "Lightstone quota exhausted or endpoint not associated with your contract." :
      response.status === 429 ? "Lightstone rate limit exceeded — please retry shortly." :
      payload?.message || `Lightstone error ${response.status}`;
    throw Object.assign(new Error(msg), { statusCode: response.status, expose: true });
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
