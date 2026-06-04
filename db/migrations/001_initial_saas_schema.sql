-- LawPath SA initial PostgreSQL schema
-- Target: PostgreSQL 14+ on Ubuntu 22.04
-- Scope: SaaS tenancy, auth, settings, legal workspace modules and portal access.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  slug text not null unique,
  registration_number text,
  vat_number text,
  primary_domain text,
  plan_name text not null default 'trial',
  status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  full_name text not null,
  email citext not null unique,
  password_hash text not null,
  role text not null default 'tenant_admin' check (role in ('platform_super_admin', 'tenant_admin', 'attorney', 'candidate_attorney', 'legal_secretary', 'billing_admin', 'client_portal_user')),
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_user_tenant_check check (
    (role = 'platform_super_admin' and tenant_id is null)
    or (role <> 'platform_super_admin' and tenant_id is not null)
  )
);

create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip inet,
  created_at timestamptz not null default now()
);

create table tenant_email_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  from_name text not null,
  from_email citext not null,
  reply_to citext not null,
  portal_signature text,
  verified_domain text,
  is_domain_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform_smtp_settings (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  host text not null,
  port integer not null check (port > 0 and port < 65536),
  username text not null,
  password_secret_ref text not null,
  encryption text not null default 'TLS' check (encryption in ('TLS', 'SSL', 'None')),
  bounce_email citext,
  transactional_enabled boolean not null default true,
  system_enabled boolean not null default true,
  active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform_api_provider_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('exchangerates', 'openai', 'gemini', 'grok')),
  api_key_secret_ref text not null,
  default_model text,
  base_currency text,
  active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exchangerates_currency_check check (
    provider <> 'exchangerates'
    or base_currency in ('ZAR', 'USD', 'EUR', 'GBP')
  )
);

create table matters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  matter_number text not null,
  title text not null,
  client_name text not null,
  client_role text,
  matter_type text not null,
  property_address text,
  estate_agent_name text,
  stage text not null default 'Intake',
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  next_step text,
  due_date date,
  risk text not null default 'Low' check (risk in ('Low', 'Medium', 'High')),
  portal_access_enabled boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, matter_number)
);

create table contract_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  matter_id uuid references matters(id) on delete set null,
  name text not null,
  category text not null,
  party_a text,
  party_b text,
  status text not null default 'Drafting',
  body text not null,
  created_by uuid references users(id) on delete set null,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table research_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  matter_id uuid references matters(id) on delete set null,
  title text not null,
  court_or_source text,
  decision_year integer,
  tags text[] not null default '{}',
  summary text not null,
  source_url text,
  raw_text text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table work_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  matter_id uuid references matters(id) on delete cascade,
  title text not null,
  owner_user_id uuid references users(id) on delete set null,
  owner_label text,
  due_at timestamptz,
  priority text not null default 'Normal' check (priority in ('Normal', 'Urgent')),
  done boolean not null default false,
  completed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  matter_id uuid references matters(id) on delete set null,
  invoice_number text not null,
  client_name text not null,
  amount_cents integer not null check (amount_cents >= 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  currency text not null default 'ZAR',
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Part-paid', 'Paid', 'Overdue', 'Void')),
  issued_at date,
  due_at date,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_number),
  constraint paid_not_above_amount check (paid_cents <= amount_cents)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  matter_id uuid references matters(id) on delete set null,
  title text not null,
  person_name text not null,
  starts_at timestamptz,
  mode text not null default 'Office' check (mode in ('Office', 'Teams', 'Phone', 'Deeds office')),
  status text not null default 'confirmed' check (status in ('held', 'confirmed', 'rescheduled', 'cancelled', 'no_show')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table portal_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  matter_id uuid not null references matters(id) on delete cascade,
  invitee_email citext not null,
  invitee_name text,
  invitee_type text not null check (invitee_type in ('client', 'estate_agent', 'executor', 'other')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table email_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  matter_id uuid references matters(id) on delete set null,
  portal_invite_id uuid references portal_invites(id) on delete set null,
  event_type text not null,
  recipient_email citext not null,
  tenant_from_name text,
  tenant_from_email citext,
  platform_smtp_setting_id uuid references platform_smtp_settings(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'bounced')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_users_tenant_id on users(tenant_id);
create index idx_matters_tenant_id on matters(tenant_id);
create index idx_contract_drafts_tenant_id on contract_drafts(tenant_id);
create index idx_research_items_tenant_id on research_items(tenant_id);
create index idx_work_tasks_tenant_id_done on work_tasks(tenant_id, done);
create index idx_invoices_tenant_id_status on invoices(tenant_id, status);
create index idx_appointments_tenant_id_starts_at on appointments(tenant_id, starts_at);
create index idx_portal_invites_tenant_id on portal_invites(tenant_id);
create index idx_email_events_tenant_id on email_events(tenant_id);
create index idx_activity_log_tenant_id_created_at on activity_log(tenant_id, created_at desc);

commit;
