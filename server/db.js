const { Pool, types } = require("pg");

// Postgres DATE (OID 1082) → keep the raw 'YYYY-MM-DD' string instead of letting
// node-pg build a JS Date at LOCAL midnight. Two real bugs come from that Date:
//
//   1. The row mappers do String(row.some_date).slice(0, 10), which on a Date
//      yields "Fri Sep 01" rather than "2023-09-01" — 18 call sites, i.e. nearly
//      every date the app displays.
//   2. Worse: local-midnight .toISOString() shifts the day backwards east of
//      Greenwich. In SAST (UTC+2) a prescription date of 2026-09-01 serialises
//      as 2026-08-31. A legal deadline displayed a day out is dangerous.
//
// A DATE has no time or zone — it is a calendar day — so carrying it as a plain
// string is both correct and what every mapper here already assumes.
// Timestamps (1114/1184) are left alone: those genuinely are instants.
types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for the API server.");
}

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

module.exports = { pool };
