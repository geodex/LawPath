// server/verifynow.js
// VerifyNow SA API wrapper — identity, compliance, CIPC, bank, vehicle checks.
// Docs: https://www.verifynow.co.za/api-docs
//
// Every call is automatically logged to verifynow_usage_log so super admins
// can monitor credit consumption. VerifyNow reports credits_spent in every
// response's metadata object — there is no dedicated balance endpoint.
//
// Usage:
//   const vn = require("./verifynow");
//   const result = await vn.verifyId({ id_number: "..." }, { tenantId, userId });

require("dotenv").config();

const crypto = require("crypto");
const https  = require("https");
const { pool } = require("./db");

// ─── Low-level HTTPS POST (Node built-in, no fetch required) ─────────────────

function httpsPost(urlStr, headers, bodyStr, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const url     = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port:     url.port || 443,
      path:     url.pathname + url.search,
      method:   "POST",
      headers:  { ...headers, "Content-Length": Buffer.byteLength(bodyStr) }
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = {}; }
        // `raw` is kept: on a validation failure the provider's own wording is
        // the only thing that says which field it wants.
        resolve({ statusCode: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json, raw });
      });
    });

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`VerifyNow request timed out after ${timeoutMs}ms`));
    });

    req.write(bodyStr);
    req.end();
  });
}

// Base URL confirmed from verifynow.co.za/api-docs/integration-guide (2026-07-30):
// all requests go to www.verifynow.co.za/api/external — api.verifynow.co.za does
// not exist in DNS (first live call ever made proved it).
const VERIFYNOW_BASE = process.env.VERIFYNOW_BASE_URL || "https://www.verifynow.co.za/api/external";

function httpsGet(urlStr, headers, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(
      { hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search, method: "GET", headers },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", chunk => { raw += chunk; });
        res.on("end", () => {
          let json;
          try { json = JSON.parse(raw); } catch { json = {}; }
          resolve({ statusCode: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json, raw });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`VerifyNow request timed out after ${timeoutMs}ms`)));
    req.end();
  });
}

// Every service we expose, transcribed from the full published API reference
// (verifynow.co.za/api-docs, read in full 2026-07-30). THIS TABLE IS THE ONLY
// PLACE any of it is written down — the HTTP proxy validates against it and the
// self-test walks it, so a service cannot exist in one place and not another.
//
// Four things it encodes that we learned the expensive way:
//   1. There is NO endpoint per service. Most services are ONE path
//      distinguished by a `reportType`/`bundle` discriminator in the body — an
//      ID verification, a consumer trace and a phone lookup are all POST /verify.
//   2. Vehicle lookup is POST /vehicle taking `registrationNumber`.
//   3. The provider never reports a per-call price, only `remainingCredits`. A
//      credit is R2.99 at the standard rate, so cost is credits × 299 cents.
//   4. Live Home Affairs / registry lookups routinely take longer than 15s.
//      Each service carries its own timeout; the old flat 15s cut real
//      searches off mid-flight.
//
// `fixed` is injected server-side so a discriminator can never be forgotten or
// contradicted by a caller. `input` names the field(s) the service reads, which
// is what the self-test uses to build a sandbox request.
const CREDIT_CENTS = 299; // standard pay-as-you-go rate, R2.99 per credit

const LIVE = 60000;   // real-time Home Affairs / eNaTIS / CIPC / bank rails
const CACHED = 30000; // cached or "lite" lookups

const SERVICE_SPECS = {
  // ── Identity ──────────────────────────────────────────────────────────────
  "verify":              { path: "verify",       fixed: { reportType: "said_verification" },          credits: 1,  timeoutMs: CACHED, input: { idNumber: "8001015009087" } },
  "id-photo":            { path: "verify",       fixed: { reportType: "home_affairs_id_photo" },      credits: 10, timeoutMs: LIVE,   input: { idNumber: "8001015009087" } },
  "alive-status":        { path: "verify",       fixed: { reportType: "home_affairs_real_time_idv" }, credits: 10, timeoutMs: LIVE,   input: { idNumber: "7905011111118" } },
  "marital-status":      { path: "verify",       fixed: { reportType: "marital-status-real-time" },   credits: 10, timeoutMs: LIVE,   input: { idNumber: "9103015257085" } },
  "id-enhanced":         { path: "id-enhanced",  fixed: {},                                           credits: 8,  timeoutMs: CACHED, input: { idNumber: "8001015009087" } },
  "verify-document":     { path: "id-document-verify", fixed: { bundle: "id_document_verification" }, credits: 3,  timeoutMs: LIVE,   input: {} },
  "face-match":          { path: "facematch",    fixed: { bundle: "facematch" },                      credits: 10, timeoutMs: LIVE,   input: {} },

  // ── Tracing (the insurance-claim workhorses) ──────────────────────────────
  "consumer-trace":      { path: "verify",              fixed: { reportType: "consumer_trace" },  credits: 10, timeoutMs: LIVE,   input: { idNumber: "8803145123084" } },
  "consumer-trace-lite": { path: "consumer-trace-lite", fixed: {},                                credits: 3,  timeoutMs: CACHED, input: { idNumber: "9103015257085" } },
  "address-lookup":      { path: "address-lookup",      fixed: {},                                credits: 3,  timeoutMs: CACHED, input: { idNumber: "8803145123084" } },
  "phone-lookup":        { path: "verify",              fixed: { reportType: "contact_enquiry" }, credits: 5,  timeoutMs: LIVE,   input: { contactNumber: "0821234567" } },
  "property-search":     { path: "property-search",     fixed: {},                                credits: 10, timeoutMs: LIVE,   input: { idNumber: "8803145123084" } },

  // ── Compliance / company / bank ───────────────────────────────────────────
  "aml-pep":                   { path: "aml-screening",             fixed: { entity: 0, country: "za", dataset: "all" },      credits: 5,  timeoutMs: LIVE, input: { name: "John Doe" } },
  "cipc/company":              { path: "cipc",                      fixed: { reportType: "cipc_company_match" },              credits: 10, timeoutMs: LIVE, input: { registration_number: "2020/123456/07" } },
  "cipc/director":             { path: "cipc",                      fixed: { reportType: "cipc_director_search" },            credits: 10, timeoutMs: LIVE, input: { idNumber: "8001015009087" } },
  "bank-account-verification": { path: "bank-account-verification", fixed: { type: "Individual", identityType: "IDNumber" },  credits: 6,  timeoutMs: LIVE,
    input: { firstName: "John", surname: "Doe", identityNumber: "9604075249086", bankName: "FNB", bankAccountNumber: "123456789", bankBranchCode: "250655", bankAccountType: "Savings" } },

  // ── Vehicle ───────────────────────────────────────────────────────────────
  "number-plate":        { path: "vehicle", fixed: { bundle: "vehicle_lookup" }, credits: 10, timeoutMs: LIVE, input: { registrationNumber: "ABC 123 GP" } },
  // The reference says /vehicle also serves a "supported VIN mode" but publishes
  // no VIN example. `vin` is our best reading; a wrong field name returns the
  // provider's own complaint and is not charged.
  "vin-decode":          { path: "vehicle", fixed: { bundle: "vehicle_lookup" }, credits: 10, timeoutMs: LIVE, input: { vin: "AAVZZZ1KZAU000000" } }
};

/** Retail cost of one call. The provider reports only the remaining balance, so
 *  this is the source of truth for what a search cost. */
function serviceCost(service) {
  const credits = SERVICE_SPECS[service]?.credits ?? 0;
  return { credits, cents: credits * CREDIT_CENTS };
}

/** Current credit balance. Free, and shaped unlike every other response:
 *  { Status: "Success", Result: { credits: "1500", last_refresh } }. */
async function getCredits() {
  const apiKey = await getApiKey();
  const result = await httpsGet(`${VERIFYNOW_BASE}/my_credits`, { "x-api-key": apiKey }, CACHED);
  if (!result.ok) {
    const err = new Error(`VerifyNow ${result.statusCode}: ${extractErrorDetail(result.json, result.raw) || "could not read credit balance"}`);
    err.statusCode = result.statusCode;
    err.expose = true;
    throw err;
  }
  const raw = result.json?.Result?.credits ?? result.json?.result?.credits ?? null;
  return {
    credits: raw === null ? null : Number(raw),
    lastRefresh: result.json?.Result?.last_refresh ?? null
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getApiKey() {
  const result = await pool.query(
    "select api_key_secret_ref from platform_api_provider_settings where provider = 'verifynow' and active = true limit 1"
  );
  const key = result.rows[0]?.api_key_secret_ref;
  if (!key) {
    const err = new Error(
      "VerifyNow API key not configured. Add it in Super Admin → Settings → API Keys."
    );
    err.statusCode = 503;
    err.expose = true;
    throw err;
  }
  return key;
}

async function logUsage({
  tenantId, userId, service, requestId,
  creditsSpent, latencyMs, status, errorCode, inputRef
}) {
  try {
    await pool.query(
      `insert into verifynow_usage_log
        (tenant_id, user_id, service, request_id, credits_spent, latency_ms, status, error_code, input_ref)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tenantId   || null,
        userId     || null,
        service,
        requestId  || null,
        creditsSpent || 0,
        latencyMs  || null,
        status,
        errorCode  || null,
        inputRef   || null
      ]
    );
  } catch (err) {
    console.warn("[verifynow] Usage logging failed:", err.message);
  }
}

// The provider is not consistent about where a complaint lives, and a 400 whose
// reason we swallowed is indistinguishable from a bug of ours. Try every shape
// seen in their docs, then fall back to the raw body.
function extractErrorDetail(payload, raw) {
  const candidates = [
    payload?.error?.message,
    payload?.message,
    payload?.detail,
    Array.isArray(payload?.errors)
      ? payload.errors.map(e => e?.message || e?.msg || (typeof e === "string" ? e : JSON.stringify(e))).filter(Boolean).join("; ")
      : null,
    typeof payload?.error === "string" ? payload.error : null,
    payload?.error && typeof payload.error === "object" ? JSON.stringify(payload.error) : null,
    (raw || "").trim().slice(0, 400)
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

async function call({ service, body, tenantId, userId, inputRef, mode }) {
  const apiKey = await getApiKey();
  const idempotencyKey = crypto.randomUUID();
  const startTime = Date.now();

  const spec = SERVICE_SPECS[service];
  // Production unless a caller explicitly asks for sandbox (the self-test does):
  // a live key must never silently run a mock search an attorney would rely on.
  // The service's discriminator (reportType/bundle) is injected here, never
  // trusted to callers.
  const requestBody = { ...body, mode: mode === "sandbox" ? "sandbox" : "production", ...(spec?.fixed || {}) };
  const timeoutMs = Number(process.env.VERIFYNOW_TIMEOUT_MS) || spec?.timeoutMs || LIVE;

  let result;
  try {
    result = await httpsPost(
      `${VERIFYNOW_BASE}/${spec?.path || service}`,
      {
        // Auth confirmed from the reference: x-api-key, not Bearer.
        "x-api-key":       apiKey,
        "Content-Type":    "application/json",
        "Idempotency-Key": idempotencyKey
      },
      JSON.stringify(requestBody),
      timeoutMs
    );
  } catch (networkErr) {
    await logUsage({ tenantId, userId, service, creditsSpent: 0, latencyMs: Date.now() - startTime, status: "error", errorCode: "network_error", inputRef });
    const timedOut = /timed out/i.test(networkErr.message || "");
    throw Object.assign(
      new Error(timedOut
        // A timeout is genuinely ambiguous: the provider may have completed and
        // charged the search. Say so rather than implying nothing happened.
        ? `VerifyNow did not respond within ${Math.round(timeoutMs / 1000)}s. The search may still have been charged — check your balance before retrying.`
        : "VerifyNow API unreachable: " + networkErr.message),
      { statusCode: 504, expose: true }
    );
  }

  const latencyMs = Date.now() - startTime;
  const payload   = result.json;
  // This API returns `requestId` and `remainingCredits` at the top level. The
  // old code read payload.metadata.{request_id,credits_spent}, which this
  // provider has never sent — so every logged call recorded 0 credits and a
  // null request id.
  const requestId    = payload?.requestId ?? payload?.request_id ?? null;
  const creditsSpent = serviceCost(service).credits;

  if (!result.ok) {
    // A rejected call is not charged (the reference is explicit that
    // unsuccessful outcomes do not deduct credits), so never log a cost here.
    await logUsage({ tenantId, userId, service, requestId, creditsSpent: 0, latencyMs, status: "error", errorCode: payload?.error?.code || String(result.statusCode), inputRef });
    const detailText = extractErrorDetail(payload, result.raw);
    console.warn(
      `[verifynow] ${service} -> ${spec?.path || service} ${result.statusCode}: ${(result.raw || "").slice(0, 600)}`
    );
    const err = new Error(
      detailText
        ? `VerifyNow ${result.statusCode}: ${detailText}`
        : `VerifyNow error ${result.statusCode}`
    );
    err.statusCode = result.statusCode;
    err.expose = true;
    throw err;
  }

  await logUsage({ tenantId, userId, service, requestId, creditsSpent, latencyMs, status: "success", inputRef });
  return payload;
}

// ─── Public surface ───────────────────────────────────────────────────────────

/** Run any service in SERVICE_SPECS. Preferred over the named helpers: there is
 *  no per-service list to keep in step with the spec table. */
function runService(service, body, ctx = {}) {
  if (!SERVICE_SPECS[service]) {
    const err = new Error(`Unknown VerifyNow service: ${service}`);
    err.statusCode = 400;
    err.expose = true;
    throw err;
  }
  return call({ service, body, ...ctx });
}

/** Service keys, for callers that need to validate or enumerate them. */
function listServices() {
  return Object.keys(SERVICE_SPECS);
}

module.exports = {
  runService,
  listServices,
  getCredits,

  /** Retail cost of a call — used to record a search as a disbursement. */
  serviceCost,

  // Named helpers kept for existing callers.
  verifyId:                (body, ctx) => runService("verify",                    body, ctx),
  verifyDocument:          (body, ctx) => runService("verify-document",           body, ctx),
  faceMatch:               (body, ctx) => runService("face-match",                body, ctx),
  amlPep:                  (body, ctx) => runService("aml-pep",                   body, ctx),
  consumerTrace:           (body, ctx) => runService("consumer-trace",            body, ctx),
  consumerTraceLite:       (body, ctx) => runService("consumer-trace-lite",       body, ctx),
  cipcCompany:             (body, ctx) => runService("cipc/company",              body, ctx),
  cipcDirector:            (body, ctx) => runService("cipc/director",             body, ctx),
  bankAccountVerification: (body, ctx) => runService("bank-account-verification", body, ctx),
  numberPlate:             (body, ctx) => runService("number-plate",              body, ctx),
  vinDecode:               (body, ctx) => runService("vin-decode",                body, ctx),

  // Exported for tests and the self-test script.
  extractErrorDetail,
  SERVICE_SPECS,
  CREDIT_CENTS
};
