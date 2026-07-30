-- 040_search_pricing.sql
-- Price a search at the moment it runs, so a disbursement can never be
-- retroactively re-priced.
--
-- Two different pricing needs, deliberately handled differently:
--
--   Dashboards (022) compute charge display-time from the CURRENT rates, so a
--   rate change immediately re-prices the view. Correct for "what is this
--   tenant worth to us this month".
--
--   A SEARCH IS NOT THAT. What the firm owes — and what it recharges its client
--   as a disbursement — was fixed when the search ran. If a markup change next
--   quarter silently re-priced a search already invoiced, the invoice and the
--   register would disagree and neither would be defensible on a taxation of
--   costs. So each search snapshots its own money.
--
-- Platform margin model (the owner's decision, 2026-07-30): the platform buys
-- VerifyNow credits (volume packs cost less than the R2.99 pay-as-you-go rate)
-- and resells to firms at a marked-up per-credit price. The firm recovers its
-- charge from the client.
--
--   base_cost_cents = credits × verifynow_credit_cost_cents   (what WE pay)
--   charge_cents    = base_cost_cents × (1 + markup) × (1 + vat)  (what the FIRM pays)
--   platform margin = charge_cents − base_cost_cents
--
-- Additive only.

-- ── What a VerifyNow credit actually costs the platform ──────────────────────
-- Default 299 = R2.99, the standard pay-as-you-go rate. Lower it after buying a
-- volume pack so margin reporting reflects reality.
alter table platform_pricing_config
  add column if not exists verifynow_credit_cost_cents integer not null default 299
    check (verifynow_credit_cost_cents >= 0);

-- ── Per-search money, snapshotted ────────────────────────────────────────────
-- `credits_spent` (039) held rand cents at platform cost, before any margin
-- existed. It is superseded by the columns below and kept only so nothing that
-- already read it breaks; new code must not use it.
alter table matter_searches
  add column if not exists credits         integer,        -- provider credits consumed
  add column if not exists base_cost_cents integer,        -- what the platform paid
  add column if not exists charge_cents    integer,        -- what the firm owes (the disbursement)
  add column if not exists markup_rate     numeric(5,4),   -- rate in force at search time
  add column if not exists vat_rate        numeric(5,4);   -- rate in force at search time

-- Existing rows were priced at platform cost with no markup and no VAT applied.
-- Recording that explicitly beats leaving nulls that later read as "unknown".
update matter_searches
   set base_cost_cents = coalesce(base_cost_cents, credits_spent),
       charge_cents    = coalesce(charge_cents,    credits_spent),
       markup_rate     = coalesce(markup_rate,     0),
       vat_rate        = coalesce(vat_rate,        0)
 where base_cost_cents is null
    or charge_cents is null;

-- Drives disbursement recovery per matter ([F]) and margin reporting.
create index if not exists matter_searches_charge_idx
  on matter_searches (matter_id, created_at desc)
  where charge_cents is not null;
