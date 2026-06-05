-- Google Cloud Storage backing for tenant media, legal documents and AI training data.

begin;

alter table tenant_profiles
  add column if not exists logo_storage_uri text,
  add column if not exists logo_public_url text;

alter table rag_sources
  add column if not exists gcs_bucket text,
  add column if not exists gcs_prefix text,
  add column if not exists gemini_file_uri text;

alter table rag_documents
  add column if not exists gcs_uri text,
  add column if not exists public_url text,
  add column if not exists byte_size integer;

create table storage_objects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  owner_type text not null check (owner_type in ('tenant_logo', 'rag_source', 'rag_document', 'matter_document', 'generated_document', 'media')),
  owner_id uuid,
  bucket text not null,
  object_name text not null,
  gcs_uri text not null,
  public_url text,
  content_type text,
  byte_size integer,
  metadata jsonb not null default '{}',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, object_name)
);

create index idx_storage_objects_tenant_owner on storage_objects(tenant_id, owner_type, owner_id);

commit;
