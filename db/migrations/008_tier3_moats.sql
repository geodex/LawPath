-- 008_tier3_moats.sql
-- Tier 3: SA Legal Research DB, e-Signature, Agent Network, Practice Analytics, PWA

-- ──────────────────────────────────────────────────────────────────────────────
-- SA LEGAL RESEARCH DATABASE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists legal_corpus_sources (
  id                  uuid primary key default gen_random_uuid(),
  source_name         text not null,
  source_type         text not null check (source_type in ('case_law','legislation','gazette','lpc_rules','practice_directive','regulation','constitution')),
  jurisdiction        text not null default 'South Africa',
  court_or_body       text,
  base_url            text,
  index_status        text not null default 'pending' check (index_status in ('pending','indexing','indexed','failed','update_available')),
  document_count      integer not null default 0,
  last_indexed_at     timestamptz,
  next_index_at       timestamptz,
  is_platform_corpus  boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists legal_corpus_documents (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null references legal_corpus_sources(id) on delete cascade,
  title               text not null,
  citation            text,
  court               text,
  decision_date       date,
  jurisdiction        text,
  document_type       text,
  summary             text,
  full_text_snippet   text,
  source_url          text,
  tags                text[] default '{}',
  year                integer,
  indexed_at          timestamptz not null default now()
);

create index if not exists corpus_docs_source_idx on legal_corpus_documents(source_id);
create index if not exists corpus_docs_year_idx on legal_corpus_documents(year desc);
create index if not exists corpus_docs_tags_idx on legal_corpus_documents using gin(tags);

create table if not exists tenant_research_queries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  query_text      text not null,
  results_count   integer not null default 0,
  ai_summary      text,
  citations       jsonb default '[]',
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

create index if not exists research_queries_tenant_idx on tenant_research_queries(tenant_id, created_at desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- E-SIGNATURE (ECTA COMPLIANT)
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists signature_requests (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  document_title        text not null,
  document_type         text not null default 'contract',
  matter_ref            text,
  document_body         text,
  gcs_uri               text,
  status                text not null default 'draft' check (status in ('draft','sent','partially_signed','completed','expired','cancelled')),
  created_by            uuid references users(id),
  expires_at            timestamptz,
  completed_at          timestamptz,
  ecta_disclosure_shown boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists sig_requests_tenant_idx on signature_requests(tenant_id, created_at desc);

create table if not exists signature_signatories (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  request_id          uuid not null references signature_requests(id) on delete cascade,
  signatory_name      text not null,
  signatory_email     text not null,
  signatory_id_number text,
  role                text not null default 'signer',
  order_position      integer not null default 1,
  status              text not null default 'pending' check (status in ('pending','otp_sent','signed','declined')),
  otp_hash            text,
  otp_expires_at      timestamptz,
  otp_verified        boolean not null default false,
  signed_at           timestamptz,
  ip_address          text,
  user_agent          text,
  signature_data_uri  text,
  signature_method    text check (signature_method in ('drawn','typed','uploaded')),
  created_at          timestamptz not null default now()
);

create index if not exists sig_signatories_request_idx on signature_signatories(request_id);

create table if not exists signature_audit_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  request_id      uuid not null references signature_requests(id) on delete cascade,
  signatory_id    uuid references signature_signatories(id),
  event_type      text not null,
  description     text not null,
  ip_address      text,
  user_agent      text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists sig_audit_request_idx on signature_audit_events(request_id, created_at);

-- ──────────────────────────────────────────────────────────────────────────────
-- ESTATE AGENT REFERRAL NETWORK
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists estate_agents (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  agent_name            text not null,
  agency_name           text not null,
  email                 text not null,
  phone                 text,
  ffc_number            text,
  ppra_registration     text,
  area_of_operation     text,
  status                text not null default 'active' check (status in ('active','inactive','blacklisted')),
  commission_rate       numeric(5,4) not null default 0.05,
  portal_access         boolean not null default false,
  portal_token          text unique,
  total_referrals       integer not null default 0,
  total_commission_cents bigint not null default 0,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists agents_tenant_idx on estate_agents(tenant_id);
create unique index if not exists agents_tenant_email_idx on estate_agents(tenant_id, email);

create table if not exists agent_referrals (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  agent_id              uuid not null references estate_agents(id) on delete cascade,
  matter_ref            text not null,
  property_description  text,
  buyer_name            text,
  seller_name           text,
  purchase_price_cents  bigint not null default 0,
  commission_cents      bigint not null default 0,
  commission_status     text not null default 'pending' check (commission_status in ('pending','approved','paid','disputed')),
  referral_date         date not null default current_date,
  paid_date             date,
  notes                 text,
  created_at            timestamptz not null default now()
);

create index if not exists referrals_agent_idx on agent_referrals(agent_id, created_at desc);
create index if not exists referrals_tenant_idx on agent_referrals(tenant_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- PRACTICE ANALYTICS
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists analytics_snapshots (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references tenants(id) on delete cascade,
  snapshot_date             date not null default current_date,
  period_month              text not null,
  total_matters_active      integer not null default 0,
  total_matters_closed      integer not null default 0,
  wip_total_cents           bigint not null default 0,
  billed_total_cents        bigint not null default 0,
  collected_total_cents     bigint not null default 0,
  written_off_cents         bigint not null default 0,
  trust_balance_cents       bigint not null default 0,
  debtors_30_cents          bigint not null default 0,
  debtors_60_cents          bigint not null default 0,
  debtors_90_cents          bigint not null default 0,
  debtors_120_plus_cents    bigint not null default 0,
  realisation_rate          numeric(5,4),
  collection_rate           numeric(5,4),
  fee_earner_stats          jsonb default '[]',
  matter_type_stats         jsonb default '[]',
  created_at                timestamptz not null default now()
);

create unique index if not exists analytics_tenant_period_idx on analytics_snapshots(tenant_id, period_month);
