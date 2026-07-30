#!/usr/bin/env node
// server/scripts/verifynow-selftest.js
//
// Validates every VerifyNow service definition against the live API in SANDBOX
// mode: same key, same endpoint, same request fields, mock responses, NO CREDITS
// CHARGED. Run this after any change to server/verifynow.js and BEFORE relying
// on a search in front of a client — it catches a wrong path, a wrong field name
// or a renamed discriminator without spending money or needing a deploy.
//
//   node server/scripts/verifynow-selftest.js              # all services
//   node server/scripts/verifynow-selftest.js number-plate # one service
//   node server/scripts/verifynow-selftest.js --production # REAL searches, COSTS MONEY
//
// Requires the VerifyNow key to be configured in Super Admin → Settings → API
// Keys (it is read from the database, exactly as the app reads it).

require("dotenv").config();
const vn = require("../verifynow");
const { pool } = require("../db");

const args = process.argv.slice(2);
const production = args.includes("--production");
const only = args.filter(a => !a.startsWith("--"));

const money = cents => `R${(cents / 100).toFixed(2)}`;

(async () => {
  const services = only.length ? only : vn.listServices();
  const unknown = services.filter(s => !vn.SERVICE_SPECS[s]);
  if (unknown.length) {
    console.error(`Unknown service(s): ${unknown.join(", ")}`);
    console.error(`Known: ${vn.listServices().join(", ")}`);
    process.exit(2);
  }

  console.log(`\nVerifyNow self-test — ${production ? "PRODUCTION (REAL SEARCHES, CHARGED)" : "sandbox (free, mock data)"}`);
  console.log(`${services.length} service(s)\n`);

  if (production) {
    const total = services.reduce((sum, s) => sum + vn.serviceCost(s).cents, 0);
    console.log(`!! This will run REAL searches costing about ${money(total)}. Ctrl-C within 5s to abort.\n`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Balance first: a 401/403 here means the key is wrong, and every service
  // failure below would be that same one problem wearing a disguise.
  let balanceBefore = null;
  try {
    const bal = await vn.getCredits();
    balanceBefore = bal.credits;
    console.log(`Credit balance: ${bal.credits}${bal.lastRefresh ? ` (refreshed ${bal.lastRefresh})` : ""}\n`);
  } catch (err) {
    console.log(`Could not read credit balance: ${err.message}`);
    console.log("If this is an auth failure, fix the key before reading anything below.\n");
  }

  const rows = [];
  for (const service of services) {
    const spec = vn.SERVICE_SPECS[service];
    const body = { ...spec.input };
    const started = Date.now();
    let status, detail;
    try {
      const res = await vn.runService(service, body, production ? {} : { mode: "sandbox" });
      const ok = res?.success !== false;
      status = ok ? "PASS" : "SOFT-FAIL";
      const results = res?.results ?? res?.result ?? {};
      const keys = Object.keys(results);
      detail = keys.length ? `results: ${keys.slice(0, 3).join(", ")}` : "no results object";
      if (typeof res?.remainingCredits === "number") detail += ` · ${res.remainingCredits} credits left`;
    } catch (err) {
      // 400/404 here is the finding: our path or field names are wrong.
      status = err.statusCode === 404 ? "BAD PATH" : err.statusCode === 400 ? "BAD REQUEST" : "ERROR";
      detail = err.message;
    }
    const ms = Date.now() - started;
    rows.push({ service, path: spec.path, status, ms, detail });
    const flag = status === "PASS" ? "  ok  " : status === "SOFT-FAIL" ? " soft " : " FAIL ";
    console.log(`${flag} ${service.padEnd(28)} /${spec.path.padEnd(26)} ${String(ms + "ms").padStart(7)}  ${status}`);
    if (status !== "PASS") console.log(`       ${detail}`);
  }

  const failed = rows.filter(r => !["PASS", "SOFT-FAIL"].includes(r.status));
  const slowest = rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]);

  console.log(`\n${rows.length - failed.length}/${rows.length} service definitions valid.`);
  console.log(`Slowest: ${slowest.service} at ${slowest.ms}ms (its timeout is ${vn.SERVICE_SPECS[slowest.service].timeoutMs}ms).`);

  if (failed.length) {
    console.log(`\nNeeds fixing in server/verifynow.js SERVICE_SPECS:`);
    for (const r of failed) console.log(`  ${r.service} (/${r.path}) — ${r.status}: ${r.detail}`);
  }

  if (production && balanceBefore !== null) {
    try {
      const after = await vn.getCredits();
      console.log(`\nCredits: ${balanceBefore} -> ${after.credits} (spent ${balanceBefore - after.credits})`);
    } catch { /* balance is a nicety, not the result */ }
  }

  await pool.end();
  process.exit(failed.length ? 1 : 0);
})().catch(async err => {
  console.error(err);
  try { await pool.end(); } catch { /* already closed */ }
  process.exit(1);
});
