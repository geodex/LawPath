-- 022_pricing_config.sql
-- Platform-wide pricing rates applied to all external-provider usage when
-- billing tenants. Singleton row enforced via id=1.
--
-- Tenant pay-per-search formula:
--   tenant_charge = base_cost * (1 + vat_rate) * (1 + markup_rate)
--   margin        = tenant_charge - base_with_vat
--
-- Computed display-time (in queries / UI), not stored on every log row, so
-- a rate change immediately re-prices the dashboard without rewriting
-- history. For monthly reconciliation against the providers' invoices,
-- snapshot the rates with the period.

create table if not exists platform_pricing_config (
  id          integer primary key default 1 check (id = 1),
  vat_rate    numeric(5,4) not null default 0.1500 check (vat_rate    >= 0 and vat_rate    <= 1),
  markup_rate numeric(5,4) not null default 0.0000 check (markup_rate >= 0 and markup_rate <= 5),
  updated_at  timestamptz  not null default now(),
  updated_by  uuid references users(id) on delete set null
);

-- Seed the singleton row (SA standard VAT = 15%, markup defaults to 0 so
-- the dashboard shows base cost until the platform owner sets a markup).
insert into platform_pricing_config (id, vat_rate, markup_rate)
values (1, 0.1500, 0.0000)
on conflict (id) do nothing;
