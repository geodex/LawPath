// server/court-rules.js
// South African court-day arithmetic.
//
// Counting days in litigation is not calendar arithmetic. Uniform Rule 1(1)
// defines a "court day" as any day other than a Saturday, Sunday or public
// holiday, and provides that only court days are counted when a period is
// expressed in days by the Rules. The first day is excluded and the last
// included.
//
// Two further SA-specific wrinkles this handles:
//
//   * Public holidays are partly movable. Good Friday and Family Day track
//     Easter, so they must be computed, not tabulated. The Public Holidays Act
//     36 of 1994 s 2(1) also makes the following Monday a public holiday
//     whenever one falls on a Sunday.
//   * Dies non: the period 16 December to 15 January (both inclusive) is
//     excluded when computing certain periods. Which periods it touches is a
//     matter of judgement, so it is a per-rule flag here, never a global
//     assumption.
//
// EVERYTHING HERE IS AN AID, NOT ADVICE. A computed date is a starting point an
// attorney must verify against the rule and the court's practice directives.
// The catalogue below carries citations so the attorney can check the source
// rather than trust this code.

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
// Dates are handled in UTC throughout: a court day is a calendar day, and using
// local time would shift days across timezones.
const fromISO = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// Anonymous Gregorian computus — Easter Sunday for a given year.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// South African public holidays for a year, as ISO date -> name.
function saPublicHolidays(year) {
  const out = new Map();
  const put = (d, name) => out.set(toISO(d), name);

  const fixed = [
    [1, 1, "New Year's Day"],
    [3, 21, "Human Rights Day"],
    [4, 27, "Freedom Day"],
    [5, 1, "Workers' Day"],
    [6, 16, "Youth Day"],
    [8, 9, "National Women's Day"],
    [9, 24, "Heritage Day"],
    [12, 16, "Day of Reconciliation"],
    [12, 25, "Christmas Day"],
    [12, 26, "Day of Goodwill"]
  ];
  for (const [m, d, name] of fixed) put(new Date(Date.UTC(year, m - 1, d)), name);

  const easter = easterSunday(year);
  put(addDays(easter, -2), "Good Friday");
  put(addDays(easter, 1), "Family Day");

  // Public Holidays Act 36 of 1994 s 2(1): a holiday falling on a Sunday makes
  // the following Monday a public holiday too.
  for (const [iso, name] of [...out.entries()]) {
    const d = fromISO(iso);
    if (d.getUTCDay() === 0) put(addDays(d, 1), `${name} observed`);
  }
  return out;
}

const holidayCache = new Map();
function holidaysFor(year) {
  if (!holidayCache.has(year)) holidayCache.set(year, saPublicHolidays(year));
  return holidayCache.get(year);
}

function publicHolidayName(date) {
  return holidaysFor(date.getUTCFullYear()).get(toISO(date)) || null;
}

const isWeekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

// A court day: not a Saturday, Sunday or public holiday (Uniform Rule 1(1)).
function isCourtDay(date) {
  return !isWeekend(date) && !publicHolidayName(date);
}

// Dies non: 16 December - 15 January, both days inclusive.
function inDiesNon(date) {
  const m = date.getUTCMonth() + 1, d = date.getUTCDate();
  return (m === 12 && d >= 16) || (m === 1 && d <= 15);
}

/**
 * Add N court days to a date, per Uniform Rule 1(1): the first day is excluded
 * and the last included, and only court days count.
 *
 * Returns the due date plus the working — which days were skipped and why — so
 * an attorney can check the reasoning rather than trust a bare date.
 */
function addCourtDays(fromDate, n, { skipDiesNon = false, maxIterations = 2000 } = {}) {
  const start = fromISO(fromDate);
  if (isNaN(start.getTime())) throw new Error(`Invalid date: ${fromDate}`);
  if (!Number.isInteger(n) || n < 1) throw new Error("Days must be a positive whole number.");

  const skipped = [];
  let counted = 0;
  let cursor = start;
  let guard = 0;

  while (counted < n) {
    if (++guard > maxIterations) throw new Error("Could not resolve a due date — check the inputs.");
    cursor = addDays(cursor, 1);

    const holiday = publicHolidayName(cursor);
    const dnn = skipDiesNon && inDiesNon(cursor);
    if (isWeekend(cursor)) { skipped.push({ date: toISO(cursor), reason: cursor.getUTCDay() === 6 ? "Saturday" : "Sunday" }); continue; }
    if (holiday) { skipped.push({ date: toISO(cursor), reason: holiday }); continue; }
    if (dnn) { skipped.push({ date: toISO(cursor), reason: "dies non (16 Dec – 15 Jan)" }); continue; }
    counted++;
  }

  return {
    fromDate: toISO(start),
    days: n,
    basis: "court",
    diesNonApplied: skipDiesNon,
    dueDate: toISO(cursor),
    skippedCount: skipped.length,
    skipped
  };
}

// Calendar days, for periods the rules express in ordinary days.
function addCalendarDays(fromDate, n) {
  const start = fromISO(fromDate);
  if (isNaN(start.getTime())) throw new Error(`Invalid date: ${fromDate}`);
  if (!Number.isInteger(n) || n < 1) throw new Error("Days must be a positive whole number.");
  return {
    fromDate: toISO(start), days: n, basis: "calendar", diesNonApplied: false,
    dueDate: toISO(addDays(start, n)), skippedCount: 0, skipped: []
  };
}

// A starting catalogue of common periods. `citation` is what the attorney should
// check — these are configurable defaults, not authority, and practice
// directives or a court order override them.
const RULES = [
  { key: "notice_of_intention_to_defend_hc", label: "Notice of intention to defend (High Court)",
    days: 10, basis: "court", diesNon: true, trigger: "Service of summons",
    citation: "Uniform Rule 19(1)" },
  { key: "plea_hc", label: "Plea", days: 20, basis: "court", diesNon: true,
    trigger: "Delivery of notice of intention to defend", citation: "Uniform Rule 22(1)" },
  { key: "discovery_hc", label: "Discovery affidavit", days: 20, basis: "court", diesNon: false,
    trigger: "Notice in terms of Rule 35(1)", citation: "Uniform Rule 35(1)" },
  { key: "answering_affidavit", label: "Answering affidavit", days: 15, basis: "court", diesNon: false,
    trigger: "Notice of intention to oppose", citation: "Uniform Rule 6(5)(d)(ii)" },
  { key: "replying_affidavit", label: "Replying affidavit", days: 10, basis: "court", diesNon: false,
    trigger: "Delivery of answering affidavit", citation: "Uniform Rule 6(5)(e)" },
  { key: "notice_of_bar", label: "Notice of bar", days: 5, basis: "court", diesNon: false,
    trigger: "Expiry of the period to plead", citation: "Uniform Rule 26" },
  { key: "notice_of_intention_to_defend_mc", label: "Notice of intention to defend (Magistrates' Court)",
    days: 10, basis: "court", diesNon: false, trigger: "Service of summons",
    citation: "Magistrates' Courts Rule 13(1)" },
  { key: "leave_to_appeal", label: "Application for leave to appeal", days: 15, basis: "court", diesNon: false,
    trigger: "Date of the order", citation: "Uniform Rule 49(1)(b)" }
];

const ruleByKey = (key) => RULES.find(r => r.key === key) || null;

// Apply a catalogue rule to a trigger date.
function applyRule(key, fromDate, overrides = {}) {
  const rule = ruleByKey(key);
  if (!rule) throw new Error(`Unknown rule: ${key}`);
  const days = Number.isInteger(overrides.days) ? overrides.days : rule.days;
  const basis = overrides.basis || rule.basis;
  const diesNon = overrides.diesNon === undefined ? rule.diesNon : !!overrides.diesNon;
  const calc = basis === "calendar" ? addCalendarDays(fromDate, days) : addCourtDays(fromDate, days, { skipDiesNon: diesNon });
  return { ...calc, rule: { key: rule.key, label: rule.label, citation: rule.citation, trigger: rule.trigger } };
}

module.exports = {
  easterSunday, saPublicHolidays, publicHolidayName, isCourtDay, inDiesNon,
  addCourtDays, addCalendarDays, applyRule, RULES, ruleByKey, toISO
};
