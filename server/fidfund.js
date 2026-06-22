// server/fidfund.js
// Fidelity Fund Certificate verification against the LPC Fidelity Fund
// public verification portal at https://ffc.fidfund.co.za/verification/
//
// The portal is a server-rendered HTML form. This module fetches the form,
// discovers the input fields dynamically (covers form rename), submits the
// certificate number, and parses the response heuristically.
//
// The portal HTML format is owned by FidFund and may change. We classify the
// outcome as 'valid' | 'invalid' | 'unknown' and always return the raw HTML
// response in the audit log so a human can spot-check edge cases.

const https = require("https");
const { URL, URLSearchParams } = require("url");

const PORTAL_BASE = "https://ffc.fidfund.co.za";
const PORTAL_PATH = "/verification/";

const USER_AGENT = "Mozilla/5.0 (LawPath SA FFC Verifier; +https://lawpath.co.za)";
const TIMEOUT_MS = 15000;

function httpsRequest({ method, url, headers, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      method,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-ZA,en;q=0.9",
        ...(headers || {})
      },
      timeout: TIMEOUT_MS
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("FidFund request timed out")));
    if (body) req.write(body);
    req.end();
  });
}

// Extract cookies from Set-Cookie response headers for the next request.
function collectCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

// Find the <form> element on the page and extract its action + method.
function findForm(html) {
  const m = html.match(/<form\b([^>]*)>([\s\S]*?)<\/form>/i);
  if (!m) return null;
  const attrs = m[1];
  const inner = m[2];
  const actionM = attrs.match(/\baction\s*=\s*["']([^"']*)["']/i);
  const methodM = attrs.match(/\bmethod\s*=\s*["']([^"']*)["']/i);
  return {
    action: actionM ? actionM[1] : "",
    method: methodM ? methodM[1].toUpperCase() : "POST",
    inner
  };
}

// Discover input fields inside a form: name → { type, value }.
function extractInputs(formInner) {
  const inputs = {};
  const re = /<input\b([^>]+)>/gi;
  let m;
  while ((m = re.exec(formInner))) {
    const attrs = m[1];
    const nameM = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i);
    if (!nameM) continue;
    const typeM = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const valueM = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i);
    inputs[nameM[1]] = {
      type: (typeM ? typeM[1] : "text").toLowerCase(),
      value: valueM ? valueM[1] : ""
    };
  }
  return inputs;
}

// Heuristic: pick the input most likely to receive the FFC number.
// Looks for any text input whose name hints at certificate/number/ffc.
function pickCertificateField(inputs) {
  const candidates = Object.keys(inputs).filter((n) => inputs[n].type === "text" || inputs[n].type === "search" || inputs[n].type === "number" || inputs[n].type === "");
  if (candidates.length === 0) return null;
  const ranked = candidates
    .map((name) => {
      const low = name.toLowerCase();
      let score = 0;
      if (/ffc|certificate/.test(low)) score += 10;
      if (/number|num\b|cert_no|certno/.test(low)) score += 5;
      if (/firm|attorney|practice/.test(low)) score += 2;
      if (/search|q|query/.test(low)) score += 1;
      return { name, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0].name;
}

// Classify the response HTML as valid / invalid / unknown.
function classifyResponse(html) {
  const lower = html.toLowerCase();
  const validSignals  = ["certificate is valid", "valid certificate", "is currently valid", "active fidelity", "in good standing"];
  const invalidSignals = ["no record", "not found", "no results", "invalid certificate", "not valid", "could not be verified", "no matching"];
  if (validSignals.some((s) => lower.includes(s))) return "valid";
  if (invalidSignals.some((s) => lower.includes(s))) return "invalid";
  return "unknown";
}

// Extract a short human-readable snippet around the verification verdict, for
// the super-admin to eyeball in the audit log without parsing the full HTML.
function extractSnippet(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 800);
}

// Main entry — accepts an FFC number, returns { status, raw, snippet, request, response }.
async function verifyFfcNumber(ffcNumber) {
  if (!ffcNumber || typeof ffcNumber !== "string") {
    throw new Error("ffcNumber is required");
  }
  const portalUrl = PORTAL_BASE + PORTAL_PATH;
  console.info(`[fidfund] Verifying FFC ${ffcNumber}`);

  // Step 1: GET the form page (session cookies + CSRF/discovery).
  const getRes = await httpsRequest({ method: "GET", url: portalUrl });
  if (getRes.status >= 400) {
    return {
      status: "unknown",
      error: `Portal GET failed with HTTP ${getRes.status}`,
      portalReachable: false
    };
  }

  const form = findForm(getRes.body);
  if (!form) {
    return {
      status: "unknown",
      error: "Could not find verification form on portal page. Site structure may have changed.",
      snippet: extractSnippet(getRes.body),
      portalReachable: true
    };
  }

  const inputs = extractInputs(form.inner);
  const certField = pickCertificateField(inputs);
  if (!certField) {
    return {
      status: "unknown",
      error: "Could not detect FFC number input field. Site structure may have changed.",
      formInputs: Object.keys(inputs),
      portalReachable: true
    };
  }

  // Step 2: Build form body. Preserve hidden/default values, set our field.
  const body = new URLSearchParams();
  for (const [name, meta] of Object.entries(inputs)) {
    if (name === certField) body.set(name, ffcNumber);
    else if (meta.type !== "submit" && meta.type !== "reset") body.set(name, meta.value || "");
  }
  // Some submit buttons need to appear; include the first submit by name if any.
  for (const [name, meta] of Object.entries(inputs)) {
    if (meta.type === "submit" && !body.has(name)) body.set(name, meta.value || "Search");
  }

  // Step 3: POST. Resolve relative action against the portal URL.
  const actionUrl = new URL(form.action || PORTAL_PATH, PORTAL_BASE).toString();
  const cookies = collectCookies(getRes.headers["set-cookie"]);

  const postRes = await httpsRequest({
    method: form.method || "POST",
    url: actionUrl,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookies,
      "Referer": portalUrl,
      "Origin": PORTAL_BASE
    },
    body: body.toString()
  });

  const verdict = classifyResponse(postRes.body);
  const snippet = extractSnippet(postRes.body);

  console.info(`[fidfund] FFC ${ffcNumber} → ${verdict} (HTTP ${postRes.status}, ${snippet.length} chars)`);

  return {
    status: verdict,                 // 'valid' | 'invalid' | 'unknown'
    portalReachable: true,
    httpStatus: postRes.status,
    detectedField: certField,
    detectedFields: Object.keys(inputs),
    snippet,
    rawHtmlLength: postRes.body.length
  };
}

module.exports = { verifyFfcNumber };
