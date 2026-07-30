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

// Our stable service keys → what VerifyNow actually wants. Read off the full
// published API reference (verifynow.co.za/api-docs, 2026-07-30).
//
// Three things this encodes that cost us a live 400 to learn:
//   1. There is NO endpoint per service. Several services are ONE path
//      distinguished by a `reportType` or `bundle` discriminator in the body —
//      a consumer trace and an ID verification are both POST /verify.
//   2. Vehicle lookup is POST /vehicle taking `registrationNumber`, not a
//      /number-plate path taking `licence_number`.
//   3. The provider does NOT report per-call cost in its response (only
//      `remainingCredits`), so the price list is ours to carry. `cents` is the
//      retail rand price — it is what a disbursement is recovered at.
//
// `fixed` is injected server-side so the discriminator can never be forgotten,
// or contradicted, by a caller.
const SERVICE_SPECS = {
  "verify":                    { path: "verify",                    fixed: { reportType: "said_verification" },     credits: 1,  cents: 299 },
  "consumer-trace":            { path: "verify",                    fixed: { reportType: "consumer_trace" },        credits: 10, cents: 2990 },
  "consumer-trace-lite":       { path: "consumer-trace-lite",       fixed: {},                                      credits: 3,  cents: 897 },
  "aml-pep":                   { path: "aml-screening",             fixed: { entity: 0, country: "za", dataset: "all" }, credits: 5, cents: 1495 },
  "cipc/company":              { path: "cipc",                      fixed: { reportType: "cipc_company_match" },    credits: 10, cents: 2990 },
  "cipc/director":             { path: "cipc",                      fixed: { reportType: "cipc_director_search" },  credits: 10, cents: 2990 },
  "bank-account-verification": { path: "bank-account-verification", fixed: { type: "Individual", identityType: "IDNumber" }, credits: 6, cents: 1794 },
  "number-plate":              { path: "vehicle",                   fixed: { bundle: "vehicle_lookup" },            credits: 10, cents: 2990 },
  // The reference says /vehicle also serves "supported VIN mode" but publishes
  // no VIN example. Sending `vin` is our best reading; a wrong field name now
  // returns the provider's own complaint (400s are not charged).
  "vin-decode":                { path: "vehicle",                   fixed: { bundle: "vehicle_lookup" },            credits: 10, cents: 2990 },
  "face-match":                { path: "facematch",                 fixed: { bundle: "facematch" },                 credits: 10, cents: 2990 },
  "verify-document":           { path: "id-document-verify",        fixed: {},                                      credits: 8,  cents: 2392 }
};

/** Retail cost of one call. The provider reports only the remaining balance, so
 *  this table is the source of truth for what a search cost. */
function serviceCost(service) {
  const spec = SERVICE_SPECS[service];
  return { credits: spec?.credits ?? 0, cents: spec?.cents ?? 0 };
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

async function call({ service, body, tenantId, userId, inputRef }) {
  const apiKey = await getApiKey();
  const idempotencyKey = crypto.randomUUID();
  const startTime = Date.now();

  const spec = SERVICE_SPECS[service];
  // Every documented example carries an explicit mode; a live key must never
  // silently run a sandbox search an attorney would rely on. The service's
  // discriminator (reportType/bundle) is injected here, not trusted to callers.
  const requestBody = { mode: "production", ...body, ...(spec?.fixed || {}) };

  let result;
  try {
    result = await httpsPost(
      `${VERIFYNOW_BASE}/${spec?.path || service}`,
      {
        // Auth confirmed from the integration guide: x-api-key, not Bearer.
        "x-api-key":       apiKey,
        "Content-Type":    "application/json",
        "Idempotency-Key": idempotencyKey
      },
      JSON.stringify(requestBody)
    );
  } catch (networkErr) {
    await logUsage({ tenantId, userId, service, creditsSpent: 0, latencyMs: Date.now() - startTime, status: "error", errorCode: "network_error", inputRef });
    throw Object.assign(new Error("VerifyNow API unreachable: " + networkErr.message), { statusCode: 503, expose: true });
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

// ─── Service Methods ──────────────────────────────────────────────────────────

module.exports = {
  // Identity verification
  verifyId:        (body, ctx) => call({ service: "verify",          body, ...ctx }),
  verifyDocument:  (body, ctx) => call({ service: "verify-document", body, ...ctx }),
  faceMatch:       (body, ctx) => call({ service: "face-match",      body, ...ctx }),

  // Compliance screening
  amlPep:           (body, ctx) => call({ service: "aml-pep",             body, ...ctx }),
  consumerTrace:    (body, ctx) => call({ service: "consumer-trace",      body, ...ctx }),
  consumerTraceLite:(body, ctx) => call({ service: "consumer-trace-lite", body, ...ctx }),

  // Business verification
  cipcCompany:  (body, ctx) => call({ service: "cipc/company",  body, ...ctx }),
  cipcDirector: (body, ctx) => call({ service: "cipc/director", body, ...ctx }),

  // Financial
  bankAccountVerification: (body, ctx) => call({ service: "bank-account-verification", body, ...ctx }),

  // Vehicle
  numberPlate: (body, ctx) => call({ service: "number-plate", body, ...ctx }),
  vinDecode:   (body, ctx) => call({ service: "vin-decode",   body, ...ctx }),

  /** Retail cost of a call — used to record a search as a disbursement. */
  serviceCost,

  // Exported for tests.
  extractErrorDetail,
  SERVICE_SPECS
};
