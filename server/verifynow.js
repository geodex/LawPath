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
        resolve({ statusCode: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json });
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

const VERIFYNOW_BASE = "https://api.verifynow.co.za";

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

async function call({ service, body, tenantId, userId, inputRef }) {
  const apiKey = await getApiKey();
  const idempotencyKey = crypto.randomUUID();
  const startTime = Date.now();

  let result;
  try {
    result = await httpsPost(
      `${VERIFYNOW_BASE}/${service}`,
      {
        "Authorization":   `Bearer ${apiKey}`,
        "Content-Type":    "application/json",
        "Idempotency-Key": idempotencyKey
      },
      JSON.stringify(body)
    );
  } catch (networkErr) {
    await logUsage({ tenantId, userId, service, creditsSpent: 0, latencyMs: Date.now() - startTime, status: "error", errorCode: "network_error", inputRef });
    throw Object.assign(new Error("VerifyNow API unreachable: " + networkErr.message), { statusCode: 503, expose: true });
  }

  const latencyMs    = Date.now() - startTime;
  const payload      = result.json;
  const creditsSpent = payload?.metadata?.credits_spent ?? 0;
  const requestId    = payload?.metadata?.request_id    ?? null;

  if (!result.ok) {
    await logUsage({ tenantId, userId, service, requestId, creditsSpent, latencyMs, status: "error", errorCode: payload?.error?.code || String(result.statusCode), inputRef });
    const err = new Error(payload?.error?.message || `VerifyNow error ${result.statusCode}`);
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
};
