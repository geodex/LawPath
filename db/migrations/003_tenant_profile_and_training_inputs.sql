-- Tenant onboarding profile, branding and richer RAG inputs.

begin;

create table tenant_profiles (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  trading_name text,
  practice_type text,
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  postal_code text,
  phone text,
  website text,
  lpc_registration_number text,
  company_registration_number text,
  vat_number text,
  conveyancer_count integer not null default 0 check (conveyancer_count >= 0),
  senior_attorney_count integer not null default 0 check (senior_attorney_count >= 0),
  junior_attorney_count integer not null default 0 check (junior_attorney_count >= 0),
  candidate_attorney_count integer not null default 0 check (candidate_attorney_count >= 0),
  legal_secretary_count integer not null default 0 check (legal_secretary_count >= 0),
  logo_data_url text,
  onboarding_completed boolean not null default false,
  onboarding_step integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rag_sources
  add column if not exists source_url text,
  add column if not exists original_file_name text,
  add column if not exists mime_type text,
  add column if not exists extraction_summary text,
  add column if not exists metadata jsonb not null default '{}';

alter table rag_sources drop constraint if exists rag_sources_source_type_check;
alter table rag_sources
  add constraint rag_sources_source_type_check
  check (source_type in ('Case law', 'Contract bank', 'Practice manual', 'Legislation', 'Firm precedent', 'Website', 'Document upload'));

alter table platform_smtp_settings
  add column if not exists test_recipient citext;

commit;
