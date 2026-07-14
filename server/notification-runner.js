// server/notification-runner.js
// Standalone runner for scheduled notification checks.
// Called daily by PM2 cron — checks DSR deadlines and trust reconciliation gaps.

require("dotenv").config();

const { runScheduledNotificationChecks } = require("./notifications");
const { runDotsPolling } = require("./dots-poller");
const { pool } = require("./db");

(async () => {
  await runScheduledNotificationChecks();
  // DOTS auto-polling: check lodged conveyancing matters for Deeds Office movement.
  await runDotsPolling();
})()
  .then(() => {
    console.info("[notification-runner] Complete.");
    return pool.end();
  })
  .catch(err => {
    console.error("[notification-runner] Error:", err.message);
    pool.end().finally(() => process.exit(1));
  });
