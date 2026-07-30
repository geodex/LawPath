-- 039_matter_searches.sql
-- Third-party data searches (vehicle, consumer, company, bank) stored on the
-- matter file.
--
-- The VerifyNow proxy (011) runs searches and logs them for CREDIT MONITORING
-- (verifynow_usage_log, super-admin only) — but the RESULT is discarded after
-- the response, so a search an attorney ran for a litigated claim never reaches
-- the file. For insurance-litigation work (number plates, consumer traces on
-- claimants) the result IS evidence on the file and its cost IS a disbursement
-- candidate. This table stores both.
--
-- `matter_id` is nullable: an ad-hoc search before a matter exists is legal and
-- common (pre-intake conflict sniffing). `provider` anticipates SearchWorks 360
-- consumer/vehicle endpoints landing later — same table, one register.
--
-- Additive only.

create table if not exists matter_searches (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  matter_id     uuid references matters(id) on delete set null,
  user_id       uuid references users(id) on delete set null,
  provider      text not null default 'verifynow'
                check (provider in ('verifynow', 'searchworks', 'lightstone')),
  service       text not null,              -- e.g. 'number-plate', 'consumer-trace'
  input         jsonb not null default '{}'::jsonb,  -- what was searched (request body, key material only)
  input_ref     text,                       -- one-line human label, e.g. the plate or ID number
  result        jsonb,                      -- full provider response payload (null on error)
  credits_spent integer not null default 0, -- provider-reported cost
  status        text not null default 'success'
                check (status in ('success', 'error')),
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists matter_searches_matter_idx
  on matter_searches (matter_id, created_at desc);

create index if not exists matter_searches_tenant_idx
  on matter_searches (tenant_id, created_at desc);
