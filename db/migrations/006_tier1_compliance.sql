-- 006_tier1_compliance.sql
-- Tier 1: Trust Account, FICA/KYC, Time Recording, POPIA Compliance

-- ──────────────────────────────────────────────────────────────────────────────
-- TRUST ACCOUNT MODULE (Section 86, Legal Practice Act)
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists trust_accounts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  account_name        text not null default 'Section 86 Trust Account',
  bank_name           text not null,
  account_number      text not null,
  branch_code         text,
  account_type        text not null default 'cheque',
  balance_cents       bigint not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists trust_accounts_tenant_idx on trust_accounts(tenant_id);

create table if not exists trust_transactions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  trust_account_id    uuid not null references trust_accounts(id),
  matter_id           uuid,
  client_name         text not null,
  entry_type          text not null check (entry_type in ('receipt','payment','transfer_in','transfer_out','adjustment')),
  description         text not null,
  reference           text,
  amount_cents        bigint not null,
  running_balance_cents bigint,
  value_date          date not null default current_date,
  reconciled          boolean not null default false,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now()
);

create index if not exists trust_transactions_tenant_idx on trust_transactions(tenant_id, trust_account_id);
create index if not exists trust_transactions_matter_idx on trust_transactions(matter_id);

create table if not exists trust_reconciliations (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  trust_account_id      uuid not null references trust_accounts(id),
  period_month          text not null,   -- e.g. '2026-05'
  bank_statement_balance_cents bigint not null default 0,
  ledger_balance_cents  bigint not null default 0,
  client_credit_total_cents bigint not null default 0,
  status                text not null default 'Draft' check (status in ('Draft','Submitted','LPC Approved')),
  notes                 text,
  reconciled_by         uuid references users(id),
  reconciled_at         timestamptz,
  created_at            timestamptz not null default now()
);

create unique index if not exists trust_recon_period_idx on trust_reconciliations(trust_account_id, period_month);

-- ──────────────────────────────────────────────────────────────────────────────
-- FICA / KYC COMPLIANCE MODULE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists fica_clients (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  matter_id             uuid,
  client_name           text not null,
  client_type           text not null default 'natural_person' check (client_type in ('natural_person','legal_entity','trust')),
  id_number             text,
  passport_number       text,
  company_registration  text,
  date_of_birth         date,
  nationality           text,
  tax_number            text,
  risk_rating           text not null default 'Low' check (risk_rating in ('Low','Medium','High','PEP')),
  pep_status            boolean not null default false,
  sanctions_checked     boolean not null default false,
  sanctions_checked_at  timestamptz,
  source_of_funds       text,
  source_of_wealth      text,
  fica_status           text not null default 'Pending' check (fica_status in ('Pending','In Progress','Compliant','Expired','Rejected')),
  fica_expiry_date      date,
  beneficial_owners     jsonb,
  notes                 text,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists fica_clients_tenant_idx on fica_clients(tenant_id);
create index if not exists fica_clients_matter_idx on fica_clients(matter_id);

create table if not exists fica_documents (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  fica_client_id      uuid not null references fica_clients(id) on delete cascade,
  document_type       text not null,
  document_name       text not null,
  status              text not null default 'Required' check (status in ('Required','Uploaded','Verified','Expired','Rejected')),
  expiry_date         date,
  gcs_uri             text,
  public_url          text,
  verified_by         uuid references users(id),
  verified_at         timestamptz,
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists fica_documents_client_idx on fica_documents(fica_client_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- TIME RECORDING & WIP MODULE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists time_entries (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  matter_id           uuid,
  matter_ref          text,
  client_name         text not null,
  fee_earner_id       uuid references users(id),
  fee_earner_name     text not null,
  entry_date          date not null default current_date,
  activity_type       text not null default 'professional_fee' check (activity_type in (
    'professional_fee','attendance','consultation','research','drafting','court_appearance',
    'correspondence','telephone','travel','disbursement','disbursement_recovery'
  )),
  description         text not null,
  duration_minutes    integer not null default 0,
  rate_cents          bigint not null default 0,
  amount_cents        bigint not null default 0,
  vat_rate            numeric(5,4) not null default 0.15,
  vat_amount_cents    bigint not null default 0,
  status              text not null default 'WIP' check (status in ('WIP','Billed','Written off','On hold')),
  invoice_id          uuid,
  is_disbursement     boolean not null default false,
  disbursement_vendor text,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists time_entries_tenant_idx on time_entries(tenant_id, entry_date desc);
create index if not exists time_entries_matter_idx on time_entries(matter_id);
create index if not exists time_entries_status_idx on time_entries(tenant_id, status);

-- ──────────────────────────────────────────────────────────────────────────────
-- POPIA COMPLIANCE CENTRE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists popia_processing_records (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  processing_activity   text not null,
  purpose               text not null,
  legal_basis           text not null,
  data_subjects         text[] not null default '{}',
  personal_info_types   text[] not null default '{}',
  retention_period      text not null,
  third_party_recipients text,
  cross_border_transfer boolean not null default false,
  security_measures     text,
  information_officer   text,
  review_date           date,
  active                boolean not null default true,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists popia_processing_tenant_idx on popia_processing_records(tenant_id);

create table if not exists popia_dsr_requests (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  request_type        text not null check (request_type in ('Access','Correction','Deletion','Objection','Portability')),
  requestor_name      text not null,
  requestor_email     text not null,
  requestor_id_number text,
  description         text not null,
  status              text not null default 'Received' check (status in ('Received','In Progress','Completed','Denied','Escalated')),
  received_at         timestamptz not null default now(),
  due_at              timestamptz generated always as (received_at + interval '30 days') stored,
  completed_at        timestamptz,
  response_notes      text,
  assigned_to         uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists popia_dsr_tenant_idx on popia_dsr_requests(tenant_id, status);

create table if not exists popia_consent_records (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  data_subject_name   text not null,
  data_subject_email  text not null,
  purpose             text not null,
  consent_given       boolean not null default false,
  consent_date        timestamptz,
  withdrawal_date     timestamptz,
  consent_method      text not null default 'Written' check (consent_method in ('Written','Electronic','Verbal','Portal')),
  matter_id           uuid,
  notes               text,
  created_at          timestamptz not null default now()
);

create index if not exists popia_consent_tenant_idx on popia_consent_records(tenant_id);

create table if not exists popia_breach_incidents (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  incident_date       timestamptz not null,
  description         text not null,
  data_subjects_affected integer not null default 0,
  personal_info_types text[] not null default '{}',
  severity            text not null default 'Low' check (severity in ('Low','Medium','High','Critical')),
  status              text not null default 'Open' check (status in ('Open','Under investigation','Regulator notified','Closed')),
  regulator_notified  boolean not null default false,
  regulator_notified_at timestamptz,
  remediation_steps   text,
  reported_by         uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists popia_breach_tenant_idx on popia_breach_incidents(tenant_id, status);
