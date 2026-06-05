-- 007_tier2_operations.sql
-- Tier 2: Conveyancing Pipeline, Litigation, WhatsApp, CIPC, Document Intelligence, Accounting

-- ──────────────────────────────────────────────────────────────────────────────
-- CONVEYANCING PIPELINE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists conveyancing_matters (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id) on delete cascade,
  matter_ref              text not null,
  matter_type             text not null default 'transfer'
                          check (matter_type in ('transfer','bond_registration','bond_cancellation','sectional_title','notarial_bond')),
  seller_name             text not null,
  buyer_name              text not null,
  property_description    text not null,
  erf_number              text,
  title_deed_number       text,
  purchase_price_cents    bigint not null default 0,
  transfer_duty_cents     bigint not null default 0,
  conveyancing_fee_cents  bigint not null default 0,
  vat_on_fee_cents        bigint not null default 0,
  estate_agent            text,
  bond_bank               text,
  current_stage           text not null default 'instruction_received',
  fica_status             text not null default 'Pending' check (fica_status in ('Pending','In Progress','Compliant')),
  rates_clearance_status  text not null default 'Not requested' check (rates_clearance_status in ('Not requested','Requested','Received','Expired')),
  levy_clearance_status   text not null default 'Not requested' check (levy_clearance_status in ('Not requested','Requested','Received','Expired')),
  rates_clearance_expiry  date,
  levy_clearance_expiry   date,
  linked_matter_id        uuid,
  target_registration_date date,
  notes                   text,
  created_by              uuid references users(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists conv_matters_tenant_idx on conveyancing_matters(tenant_id, created_at desc);

create table if not exists conveyancing_stage_records (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  matter_id       uuid not null references conveyancing_matters(id) on delete cascade,
  stage           text not null,
  status          text not null default 'pending' check (status in ('pending','in_progress','completed','blocked','skipped')),
  notes           text,
  completed_by    uuid references users(id),
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists conv_stages_matter_idx on conveyancing_stage_records(matter_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- LITIGATION PIPELINE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists litigation_matters (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  matter_ref          text not null,
  case_number         text,
  court               text not null,
  court_division      text,
  plaintiff           text not null,
  defendant           text not null,
  matter_type         text not null default 'opposed_motion'
                      check (matter_type in ('opposed_motion','unopposed_motion','trial','urgent_application',
                                            'section_65','section_69','rule_43','default_judgment','appeal','review')),
  current_stage       text not null default 'pleadings',
  claim_amount_cents  bigint,
  costs_recovered_cents bigint default 0,
  status              text not null default 'Active' check (status in ('Active','Settled','Abandoned','Judgment','Struck off')),
  service_date        date,
  notes               text,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists lit_matters_tenant_idx on litigation_matters(tenant_id, created_at desc);

create table if not exists litigation_deadlines (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  matter_id       uuid not null references litigation_matters(id) on delete cascade,
  description     text not null,
  rule_reference  text,
  due_date        date not null,
  days_from_service integer,
  completed       boolean not null default false,
  completed_at    timestamptz,
  completed_by    uuid references users(id),
  priority        text not null default 'Normal' check (priority in ('Normal','Urgent','Critical')),
  created_at      timestamptz not null default now()
);

create index if not exists lit_deadlines_matter_idx on litigation_deadlines(matter_id, due_date);
create index if not exists lit_deadlines_tenant_idx on litigation_deadlines(tenant_id, due_date, completed);

create table if not exists court_dates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  matter_id       uuid not null references litigation_matters(id) on delete cascade,
  court_date      date not null,
  court_time      time,
  court           text not null,
  purpose         text not null,
  roll_type       text not null default 'Unopposed' check (roll_type in ('Unopposed','Opposed','Trial','Urgent','Appeal')),
  outcome         text,
  postponed_to    date,
  attorney        text,
  created_at      timestamptz not null default now()
);

create index if not exists court_dates_tenant_idx on court_dates(tenant_id, court_date);

create table if not exists cost_orders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  matter_id       uuid not null references litigation_matters(id) on delete cascade,
  order_date      date not null,
  order_type      text not null check (order_type in ('costs','costs_in_cause','no_order','reserved','punitive_costs')),
  in_favour_of    text not null,
  against         text,
  amount_cents    bigint default 0,
  scale           text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists cost_orders_matter_idx on cost_orders(matter_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- WHATSAPP BUSINESS COMMUNICATIONS
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists whatsapp_contacts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  client_name     text not null,
  phone_number    text not null,
  matter_ref      text,
  opt_in          boolean not null default false,
  opt_in_date     timestamptz,
  opt_out_date    timestamptz,
  created_at      timestamptz not null default now()
);

create unique index if not exists wa_contacts_tenant_phone_idx on whatsapp_contacts(tenant_id, phone_number);

create table if not exists whatsapp_messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  contact_id      uuid references whatsapp_contacts(id),
  matter_ref      text,
  direction       text not null check (direction in ('inbound','outbound')),
  message_body    text not null,
  template_id     text,
  status          text not null default 'sent' check (status in ('queued','sent','delivered','read','failed')),
  provider_msg_id text,
  sent_at         timestamptz not null default now(),
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_by      uuid references users(id)
);

create index if not exists wa_messages_tenant_idx on whatsapp_messages(tenant_id, sent_at desc);
create index if not exists wa_messages_contact_idx on whatsapp_messages(contact_id);

create table if not exists whatsapp_templates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade,
  name            text not null,
  category        text not null check (category in ('transfer_update','bond_update','appointment_reminder','payment_reminder','fica_request','general')),
  body            text not null,
  variables       text[] not null default '{}',
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists wa_templates_tenant_idx on whatsapp_templates(tenant_id);

-- Platform-level WhatsApp API settings
create table if not exists platform_whatsapp_settings (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null default 'clickatell' check (provider in ('clickatell','bulksms','meta_cloud_api','twilio')),
  api_key         text,
  phone_number_id text,
  business_account_id text,
  webhook_verify_token text,
  active          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- CIPC SEARCH CACHE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists cipc_search_cache (
  id                    uuid primary key default gen_random_uuid(),
  registration_number   text not null,
  company_name          text not null,
  company_type          text,
  status                text,
  registration_date     date,
  directors             jsonb,
  raw_response          jsonb,
  searched_by           uuid references users(id),
  cached_at             timestamptz not null default now()
);

create unique index if not exists cipc_cache_regno_idx on cipc_search_cache(registration_number);

-- ──────────────────────────────────────────────────────────────────────────────
-- AI DOCUMENT INTELLIGENCE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists document_analyses (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  file_name       text not null,
  document_type   text,
  gcs_uri         text,
  analysis_status text not null default 'Queued' check (analysis_status in ('Queued','Analysing','Complete','Failed')),
  parties         text[] default '{}',
  key_dates       jsonb default '[]',
  obligations     text[] default '{}',
  risk_flags      text[] default '{}',
  sa_law_flags    text[] default '{}',
  summary         text,
  ai_model        text,
  analysed_at     timestamptz,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

create index if not exists doc_analyses_tenant_idx on document_analyses(tenant_id, created_at desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- ACCOUNTING INTEGRATION
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists accounting_connections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  provider        text not null check (provider in ('sage_pastel','xero','quickbooks','csv_export')),
  connected       boolean not null default false,
  api_key         text,
  tenant_token    text,
  company_id      text,
  last_sync_at    timestamptz,
  sync_status     text not null default 'idle' check (sync_status in ('idle','syncing','error')),
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists acct_conn_tenant_provider_idx on accounting_connections(tenant_id, provider);

create table if not exists accounting_export_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  provider        text not null,
  export_type     text not null check (export_type in ('invoice','trust_receipt','disbursement','time_entry','full_sync')),
  record_count    integer not null default 0,
  status          text not null default 'exported' check (status in ('exported','failed','partial')),
  error_message   text,
  exported_by     uuid references users(id),
  exported_at     timestamptz not null default now()
);

create index if not exists acct_export_tenant_idx on accounting_export_log(tenant_id, exported_at desc);
