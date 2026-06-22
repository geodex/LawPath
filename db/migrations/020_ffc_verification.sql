-- Fidelity Fund Certificate capture + verification audit trail on tenant_profiles.
-- Per the Legal Practice Act, every practising attorney/firm must hold a current
-- FFC issued by the Legal Practitioners Fidelity Fund. Captured at onboarding,
-- verified against https://ffc.fidfund.co.za/verification/ via server/fidfund.js.

alter table tenant_profiles
  add column if not exists ffc_number text,
  add column if not exists ffc_year integer,
  add column if not exists ffc_verified_at timestamptz,
  add column if not exists ffc_verification_status text
    check (ffc_verification_status in ('valid', 'invalid', 'unknown', 'pending'));

-- Audit log so super admins can review every verification attempt + the
-- raw classifier output. One row per attempt — successful or not.
create table if not exists ffc_verification_log (
  id            bigserial primary key,
  tenant_id     uuid references tenants(id) on delete cascade,
  user_id       uuid references users(id) on delete set null,
  ffc_number    text not null,
  status        text not null,                 -- 'valid' | 'invalid' | 'unknown' | 'error'
  http_status   integer,
  detected_field text,
  snippet       text,
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists ffc_verification_log_tenant_idx on ffc_verification_log (tenant_id, created_at desc);
