-- LawPath SA AI training and RAG schema
-- Stores super-admin assistant profiles, knowledge sources, index jobs and retrievable chunks.

begin;

create table assistant_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  retrieval_mode text not null default 'Balanced' check (retrieval_mode in ('Strict sources only', 'Balanced', 'Broad discovery')),
  chunk_size integer not null default 1200 check (chunk_size >= 300 and chunk_size <= 3000),
  top_k integer not null default 8 check (top_k >= 1 and top_k <= 20),
  require_citations boolean not null default true,
  allow_tenant_private_sources boolean not null default true,
  system_instructions text not null,
  active boolean not null default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rag_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  scope text not null check (scope in ('Platform', 'Tenant template', 'Tenant private')),
  source_type text not null check (source_type in ('Case law', 'Contract bank', 'Practice manual', 'Legislation', 'Firm precedent')),
  status text not null default 'Queued' check (status in ('Indexed', 'Queued', 'Needs review', 'Failed')),
  document_count integer not null default 0 check (document_count >= 0),
  storage_uri text,
  last_indexed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rag_source_scope_tenant_check check (
    (scope in ('Platform', 'Tenant template') and tenant_id is null)
    or (scope = 'Tenant private' and tenant_id is not null)
  )
);

create table rag_documents (
  id uuid primary key default gen_random_uuid(),
  rag_source_id uuid not null references rag_sources(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  title text not null,
  source_uri text,
  content_hash text not null,
  status text not null default 'Queued' check (status in ('Indexed', 'Queued', 'Needs review', 'Failed')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rag_chunks (
  id uuid primary key default gen_random_uuid(),
  rag_document_id uuid not null references rag_documents(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  citation_label text,
  metadata jsonb not null default '{}',
  embedding double precision[],
  created_at timestamptz not null default now(),
  unique (rag_document_id, chunk_index)
);

create table rag_index_jobs (
  id uuid primary key default gen_random_uuid(),
  rag_source_id uuid not null references rag_sources(id) on delete cascade,
  status text not null default 'Queued' check (status in ('Queued', 'Running', 'Completed', 'Failed')),
  documents_seen integer not null default 0,
  documents_indexed integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_assistant_profiles_active on assistant_profiles(active);
create index idx_rag_sources_scope_status on rag_sources(scope, status);
create index idx_rag_sources_tenant_id on rag_sources(tenant_id);
create index idx_rag_documents_source_id on rag_documents(rag_source_id);
create index idx_rag_documents_tenant_id on rag_documents(tenant_id);
create index idx_rag_chunks_document_id on rag_chunks(rag_document_id);
create index idx_rag_chunks_tenant_id on rag_chunks(tenant_id);
create index idx_rag_index_jobs_source_id on rag_index_jobs(rag_source_id);

commit;
