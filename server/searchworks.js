// server/searchworks.js
// SearchWorks (searchworks.co.za) Deeds Office data + DOTS tracking wrapper.
//
// Auth pattern (confirmed from doccentral.searchworks.co.za):
//   POST /auth/login/  body: {Username, Password}    → returns SessionToken
//   Every API call POSTs JSON with SessionToken IN THE BODY (not a header).
//   POST /auth/logout/ body: {SessionToken}
//   POST /auth/validatetoken/ body: {SessionToken}
//
// Spec status (after authenticated crawl of doccentral.searchworks.co.za):
//   [x] Auth — session token in body, login returns SessionToken
//   [x] UAT base URL — uatrest.searchworks.co.za
//   [x] All deeds office single + cross-office search paths
//   [x] Property history (person / company / trust) paths
//   [x] Property ownership history endpoint
//   [x] Document retrieval (bond + title deed) path
//   [x] DOTS — person, company, property-erf, barcode
//   [x] Lightstone valuation (re-sold by SearchWorks) — erf endpoint
//   [ ] Production base URL — likely rest.searchworks.co.za, confirm with SearchWorks
//   [ ] Per-call ZAR cost — no pricing in DocCentral; placeholders in CREDIT_COST
//
// Casing inconsistencies preserved in the wrapper (SearchWorks docs vary by
// endpoint): see CAMELCASE_SERVICES set + per-handler body construction.
//
// Credentials are stored in platform_api_provider_settings.api_key_secret_ref
// as JSON: {"username":"...","password":"..."} — set via Super Admin Settings UI.

require("dotenv").config();
const https = require("https");
const { pool } = require("./db");

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = process.env.SEARCHWORKS_BASE_URL || "https://uatrest.searchworks.co.za";

// Endpoint paths (all SearchWorks paths end with a trailing slash).
// Confirmed from doccentral.searchworks.co.za via authenticated docs crawl.
const PATHS = {
  // Auth
  "login":                 "/auth/login/",
  "logout":                "/auth/logout/",
  "validate-token":        "/auth/validatetoken/",
  "search-limit":          "/auth/GetSearchLimitDetails/",
  // Diagnostic
  "commtest":              "/commtest/",
  // Billing reports
  "billing-branch":        "/billingreports/branch/",
  "billing-company":       "/billingreports/company/",
  // Deeds Office — single-office searches (PascalCase fields)
  "deeds-person":          "/deedsoffice/person/",
  "deeds-company":         "/deedsoffice/company/",
  "deeds-trust":           "/deedsoffice/trust/",
  "deeds-property-erf":    "/deedsoffice/property/erf/",
  "deeds-property-farm":   "/deedsoffice/property/farm/",
  "deeds-property-scheme": "/deedsoffice/property/scheme/",
  "deeds-document":        "/deedsoffice/property/document/",
  // Deeds Office — cross-deeds searches across multiple offices
  "deeds-cross-person":    "/deedsoffice/crossdeeds/person/",
  "deeds-cross-company":   "/deedsoffice/crossdeeds/company/",
  "deeds-cross-trust":     "/deedsoffice/crossdeeds/trust/",
  // DOTS — Deeds Office Tracking System (camelCase fields except barcode)
  "dots-person":           "/dots/person/",
  "dots-company":          "/dots/company/",
  "dots-property-erf":     "/dots/property/erf/",
  "dots-barcode":          "/dots/property/barcode/",
  // Document retrieval (PDF of bond / title deed)
  "document-request":      "/documents/deedsoffice/requestdeedsdocument/",
  // Property history (search across all deeds offices)
  "property-history-person":  "/individual/propertyhistory/",
  "property-history-company": "/csi/company/propertyhistory/",
  "property-history-trust":   "/csi/trust/propertyhistory/",
  // Property ownership (across erf/farm/holding/scheme/LPI)
  "property-ownership":       "/property/PropertyOwnershipHistory/",
  // Lightstone valuation re-sold by SearchWorks
  "valuation-erf":            "/lightstone/valuation/erf/"
};

// Endpoints that use camelCase field names (DOTS person/company/property-erf).
// All other endpoints use PascalCase (SessionToken / Reference / etc.).
const CAMELCASE_SERVICES = new Set([
  "dots-person", "dots-company", "dots-property-erf"
]);

// Per-service Rand-cent cost — PLACEHOLDERS, no public pricing schedule yet.
// Replace with the values from SearchWorks' commercial agreement once confirmed.
const CREDIT_COST = {
  "commtest":                0,
  "validate-token":          0,
  "search-limit":            0,
  "billing-branch":          0,
  "billing-company":         0,
  "deeds-person":            2567,
  "deeds-company":           2567,
  "deeds-trust":             2567,
  "deeds-property-erf":      2567,
  "deeds-property-farm":     2567,
  "deeds-property-scheme":   2567,
  "deeds-document":          2567,
  "deeds-cross-person":      5000,
  "deeds-cross-company":     5000,
  "deeds-cross-trust":       5000,
  "dots-person":             2567,
  "dots-company":            2567,
  "dots-property-erf":       2567,
  "dots-barcode":            2567,
  "document-request":        5000,
  "property-history-person":  3500,
  "property-history-company": 3500,
  "property-history-trust":   3500,
  "property-ownership":       3500,
  "valuation-erf":            4000
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
  // SearchWorks login returns the session token in `ResponseMessage` (their
  // generic envelope field — e.g. commtest also returns the echoed test
  // value there). Fall through to other common spellings just in case.
  const token = res.json?.ResponseMessage || res.json?.SessionToken || res.json?.sessionToken || res.json?.Token || res.json?.token;
  if (!token) {
    throw Object.assign(
      new Error(`SearchWorks login returned no session token. Response keys: ${Object.keys(res.json || {}).join(", ") || "(empty)"}`),
      { statusCode: 502, expose: true }
    );
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
  let payload;
  if (skipAuth) {
    payload = body;
  } else if (CAMELCASE_SERVICES.has(service)) {
    payload = { sessionToken, ...body };
  } else {
    payload = { SessionToken: sessionToken, ...body };
  }

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

// ─── Service methods ───────────────────────────────────────────────────────
// All accept (input, ctx) where input is the request body in camelCase JS
// conventions; the handler normalises into the exact body shape SearchWorks
// expects (PascalCase or camelCase per the docs).
//
// Each handler resolves to the parsed JSON body of the SearchWorks response.

// ── Diagnostic / auth ────────────────────────────────────────────────────
async function commtest(ctx = {}) {
  return call({ service: "commtest", body: { testParam: "lawpath-ping" }, ctx, skipAuth: true });
}
async function validateToken(ctx = {}) {
  return call({ service: "validate-token", body: {}, ctx });
}
async function getSearchLimit(ctx = {}) {
  return call({ service: "search-limit", body: {}, ctx });
}

// ── Billing reports ─────────────────────────────────────────────────────
async function billingByBranch(input, ctx = {}) {
  return call({
    service: "billing-branch",
    body: { DateFrom: input?.dateFrom || "", DateTo: input?.dateTo || "" },
    ctx, inputRef: `${input?.dateFrom || ""}..${input?.dateTo || ""}`
  });
}
async function billingByCompany(input, ctx = {}) {
  return call({
    service: "billing-company",
    body: { DateFrom: input?.dateFrom || "", DateTo: input?.dateTo || "" },
    ctx, inputRef: `${input?.dateFrom || ""}..${input?.dateTo || ""}`
  });
}

// ── Deeds Office single-office searches ─────────────────────────────────
// DeedsOffice integer codes: 1=Bloemfontein, 2=CapeTown, 3=Johannesburg,
//                            4=Kimberley, 5=KingWilliamsTown, 6=Pietermaritzburg,
//                            7=Pretoria, 8=Vryburg, 9=Umtata, 11=Mpumalanga, 12=Limpopo
async function deedsPerson(input, ctx = {}) {
  return call({
    service: "deeds-person",
    body: {
      Reference:     input?.reference     || "",
      DeedsOffice:   input?.deedsOffice   || "",
      Surname:       input?.surname       || "",
      Firstname:     input?.firstname     || "",
      IDNumber:      input?.idNumber      || "",
      Sequestration: String(input?.sequestration ?? "false")
    },
    ctx, inputRef: input?.idNumber || input?.surname || null
  });
}
async function deedsCompany(input, ctx = {}) {
  return call({
    service: "deeds-company",
    body: {
      Reference:                 input?.reference                 || "",
      DeedsOffice:               input?.deedsOffice               || "",
      CompanyName:               input?.companyName               || "",
      CompanyRegistrationNumber: input?.companyRegistrationNumber || "",
      Sequestration:             String(input?.sequestration ?? "false")
    },
    ctx, inputRef: input?.companyRegistrationNumber || input?.companyName || null
  });
}
async function deedsTrust(input, ctx = {}) {
  return call({
    service: "deeds-trust",
    body: {
      Reference:     input?.reference     || "",
      DeedsOffice:   input?.deedsOffice   || "",
      TrustName:     input?.trustName     || "",
      Sequestration: String(input?.sequestration ?? "false")
    },
    ctx, inputRef: input?.trustName || null
  });
}
async function deedsPropertyErf(input, ctx = {}) {
  return call({
    service: "deeds-property-erf",
    body: {
      Reference:       input?.reference       || "",
      DeedsOffice:     input?.deedsOffice     || "",
      Township:        input?.township        || "",
      ErfNumber:       input?.erfNumber       || "",
      PortionNumber:   input?.portionNumber   || "",
      RemainingExtent: String(input?.remainingExtent ?? "false")
    },
    ctx, inputRef: input?.erfNumber || null
  });
}
async function deedsPropertyFarm(input, ctx = {}) {
  return call({
    service: "deeds-property-farm",
    body: {
      Reference:            input?.reference            || "",
      DeedsOffice:          input?.deedsOffice          || "",
      RegistrationDivision: input?.registrationDivision || "",
      FarmName:             input?.farmName             || "",
      FarmNumber:           input?.farmNumber           || "",
      PortionNumber:        input?.portionNumber        || "",
      RemainingExtent:      String(input?.remainingExtent ?? "false")
    },
    ctx, inputRef: input?.farmNumber || input?.farmName || null
  });
}
async function deedsPropertyScheme(input, ctx = {}) {
  // UnitType: 1=Units, 2=ExclusiveUseAreas, 3=Contract
  return call({
    service: "deeds-property-scheme",
    body: {
      Reference:    input?.reference    || "",
      DeedsOffice:  input?.deedsOffice  || "",
      SchemeName:   input?.schemeName   || "",
      SchemeNumber: input?.schemeNumber || "",
      UnitNumber:   input?.unitNumber   || "",
      UnitType:     input?.unitType     || ""
    },
    ctx, inputRef: input?.schemeNumber || input?.schemeName || null
  });
}
async function deedsDocument(input, ctx = {}) {
  return call({
    service: "deeds-document",
    body: {
      Reference:      input?.reference      || "",
      DeedsOffice:    input?.deedsOffice    || "",
      DocumentNumber: input?.documentNumber || ""
    },
    ctx, inputRef: input?.documentNumber || null
  });
}

// ── Deeds Office cross-deeds searches ───────────────────────────────────
// DeedsOfficeIDs: comma-delimited list, e.g. "1,3,7"
async function deedsCrossPerson(input, ctx = {}) {
  return call({
    service: "deeds-cross-person",
    body: {
      Reference:      input?.reference      || "",
      DeedsOfficeIDs: input?.deedsOfficeIDs || "",
      IDNumber:       input?.idNumber       || "",
      Firstname:      input?.firstname      || "",
      Surname:        input?.surname        || "",
      Sequestration:  String(input?.sequestration ?? "false")
    },
    ctx, inputRef: input?.idNumber || input?.surname || null
  });
}
async function deedsCrossCompany(input, ctx = {}) {
  return call({
    service: "deeds-cross-company",
    body: {
      Reference:                 input?.reference                 || "",
      DeedsOfficeIDs:            input?.deedsOfficeIDs            || "",
      CompanyName:               input?.companyName               || "",
      CompanyRegistrationNumber: input?.companyRegistrationNumber || "",
      Sequestration:             String(input?.sequestration ?? "false")
    },
    ctx, inputRef: input?.companyRegistrationNumber || input?.companyName || null
  });
}
async function deedsCrossTrust(input, ctx = {}) {
  return call({
    service: "deeds-cross-trust",
    body: {
      Reference:      input?.reference      || "",
      DeedsOfficeIDs: input?.deedsOfficeIDs || "",
      TrustName:      input?.trustName      || "",
      Sequestration:  String(input?.sequestration ?? "false")
    },
    ctx, inputRef: input?.trustName || null
  });
}

// ── DOTS — Deeds Office Tracking System ─────────────────────────────────
// NB: person / company / property-erf use camelCase (sessionToken,
// deedsOfficeID, iDNumber, etc.). Barcode uses PascalCase.
async function dotsPerson(input, ctx = {}) {
  return call({
    service: "dots-person",
    body: {
      reference:     input?.reference     || "",
      deedsOfficeID: input?.deedsOfficeID || input?.deedsOffice || "",
      iDNumber:      input?.idNumber      || "",
      firstname:     input?.firstname     || "",
      surname:       input?.surname       || ""
    },
    ctx, inputRef: input?.idNumber || input?.surname || null
  });
}
async function dotsCompany(input, ctx = {}) {
  return call({
    service: "dots-company",
    body: {
      reference:                 input?.reference                 || "",
      deedsOfficeID:             input?.deedsOfficeID || input?.deedsOffice || "",
      companyName:               input?.companyName               || "",
      companyRegistrationNumber: input?.companyRegistrationNumber || ""
    },
    ctx, inputRef: input?.companyRegistrationNumber || input?.companyName || null
  });
}
async function dotsPropertyErf(input, ctx = {}) {
  return call({
    service: "dots-property-erf",
    body: {
      reference:     input?.reference     || "",
      deedsOfficeID: input?.deedsOfficeID || input?.deedsOffice || "",
      townshipName:  input?.townshipName  || input?.township   || "",
      erfNumber:     input?.erfNumber     || "",
      portionNumber: input?.portionNumber || ""
    },
    ctx, inputRef: input?.erfNumber || null
  });
}
async function dotsBarcode(input, ctx = {}) {
  return call({
    service: "dots-barcode",
    body: {
      Reference:   input?.reference   || "",
      DeedsOffice: input?.deedsOffice || "",
      Barcode:     input?.barcode     || ""
    },
    ctx, inputRef: input?.barcode || null
  });
}

// ── Document retrieval (returns bond / title deed PDF) ──────────────────
async function requestDeedsDocument(input, ctx = {}) {
  return call({
    service: "document-request",
    body: {
      Reference:      input?.reference      || "",
      DeedsOffice:    input?.deedsOffice    || "",
      DocumentNumber: input?.documentNumber || ""
    },
    ctx, inputRef: input?.documentNumber || null
  });
}

// ── Property history (cross-office) ─────────────────────────────────────
async function propertyHistoryPerson(input, ctx = {}) {
  return call({
    service: "property-history-person",
    body: {
      Reference: input?.reference || "",
      Firstname: input?.firstname || "",
      Surname:   input?.surname   || "",
      IDNumber:  input?.idNumber  || ""
    },
    ctx, inputRef: input?.idNumber || input?.surname || null
  });
}
async function propertyHistoryCompany(input, ctx = {}) {
  // Note SearchWorks mixes casing on this endpoint: lowercase sessionToken/
  // reference, but PascalCase CompanyName.
  return call({
    service: "property-history-company",
    body: {
      reference:        input?.reference        || "",
      CompanyName:      input?.companyName      || "",
      companyRegNumber: input?.companyRegNumber || ""
    },
    ctx, inputRef: input?.companyRegNumber || input?.companyName || null
  });
}
async function propertyHistoryTrust(input, ctx = {}) {
  return call({
    service: "property-history-trust",
    body: {
      Reference:   input?.reference   || "",
      TrustNumber: input?.trustNumber || "",
      TrustName:   input?.trustName   || ""
    },
    ctx, inputRef: input?.trustNumber || input?.trustName || null
  });
}

// ── Property ownership history ─────────────────────────────────────────
// PropertyType: 1=Erf, 2=Farm, 3=Holding, 4=LPICode, 5=Scheme
// Criteria1/2/3 map to fields whose meaning depends on PropertyType.
async function propertyOwnership(input, ctx = {}) {
  return call({
    service: "property-ownership",
    body: {
      Reference:     input?.reference     || "",
      DeedsOfficeID: input?.deedsOfficeID || input?.deedsOffice || "",
      PropertyType:  input?.propertyType  || "",
      Criteria1:     input?.criteria1     || "",
      Criteria2:     input?.criteria2     || "",
      Criteria3:     input?.criteria3     || "",
      IsRemainder:   String(input?.isRemainder ?? "false")
    },
    ctx, inputRef: input?.criteria1 || null
  });
}

// ── Lightstone valuation (re-sold by SearchWorks) ──────────────────────
async function valuationErf(input, ctx = {}) {
  return call({
    service: "valuation-erf",
    body: {
      Reference:     input?.reference     || "",
      Township:      input?.township      || "",
      ErfNumber:     input?.erfNumber     || "",
      PortionNumber: input?.portionNumber || ""
    },
    ctx, inputRef: input?.erfNumber || null
  });
}

// ─── Service handler map (used by the tenant proxy in server/index.js) ──────

const SERVICE_HANDLERS = {
  // diagnostic / auth
  "commtest":              commtest,
  "validate-token":        validateToken,
  "search-limit":          getSearchLimit,
  // billing
  "billing-branch":        billingByBranch,
  "billing-company":       billingByCompany,
  // deeds — single office
  "deeds-person":          deedsPerson,
  "deeds-company":         deedsCompany,
  "deeds-trust":           deedsTrust,
  "deeds-property-erf":    deedsPropertyErf,
  "deeds-property-farm":   deedsPropertyFarm,
  "deeds-property-scheme": deedsPropertyScheme,
  "deeds-document":        deedsDocument,
  // deeds — cross office
  "deeds-cross-person":    deedsCrossPerson,
  "deeds-cross-company":   deedsCrossCompany,
  "deeds-cross-trust":     deedsCrossTrust,
  // DOTS
  "dots-person":           dotsPerson,
  "dots-company":          dotsCompany,
  "dots-property-erf":     dotsPropertyErf,
  "dots-barcode":          dotsBarcode,
  // documents
  "document-request":      requestDeedsDocument,
  // property history + ownership
  "property-history-person":  propertyHistoryPerson,
  "property-history-company": propertyHistoryCompany,
  "property-history-trust":   propertyHistoryTrust,
  "property-ownership":       propertyOwnership,
  // valuation
  "valuation-erf":            valuationErf
};

const SERVICES = Object.keys(SERVICE_HANDLERS);

module.exports = {
  commtest, validateToken, getSearchLimit,
  billingByBranch, billingByCompany,
  deedsPerson, deedsCompany, deedsTrust,
  deedsPropertyErf, deedsPropertyFarm, deedsPropertyScheme, deedsDocument,
  deedsCrossPerson, deedsCrossCompany, deedsCrossTrust,
  dotsPerson, dotsCompany, dotsPropertyErf, dotsBarcode,
  requestDeedsDocument,
  propertyHistoryPerson, propertyHistoryCompany, propertyHistoryTrust,
  propertyOwnership, valuationErf,
  SERVICE_HANDLERS, SERVICES,
  invalidateSession, getSessionToken
};
