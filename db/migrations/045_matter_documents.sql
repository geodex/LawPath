-- 045_matter_documents.sql
-- The document repository on a matter file. Queue item [E].
--
-- What existed: `document_analyses` stores what an AI READ about a document —
-- summary, parties, dates, obligations — and the original file was deliberately
-- never kept. Auto-filing filed ANALYSES to matters, not documents. So an
-- attorney could see that a lease had been analysed on a file and could not open
-- the lease. For a practice where 80% of a file is paper, that is the gap.
--
-- This stores the actual bytes in GCS and the metadata here. It does not
-- replace document_analyses; an uploaded file may also be analysed, and
-- `analysis_id` links the two when it is.
--
-- `source` records how a document arrived, so a drafted opinion the attorney
-- approved is never indistinguishable from one a client sent in.
--
-- Additive only.

create table if not exists matter_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  matter_id     uuid not null references matters(id) on delete cascade,

  file_name     text not null,
  content_type  text not null default 'application/octet-stream',
  size_bytes    bigint not null default 0,
  -- Where the bytes live. Null only if the upload failed after the row existed,
  -- which is why downloads check it rather than assuming.
  gcs_uri       text,

  description   text,
  source        text not null default 'upload'
                check (source in ('upload', 'approved_draft', 'analysis', 'correspondence')),
  -- Set when this document also has an AI analysis on record.
  analysis_id   uuid references document_analyses(id) on delete set null,
  -- Set when it came out of the approval queue (a drafted opinion, letter…).
  approval_id   uuid references approval_requests(id) on delete set null,

  uploaded_by   uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- Soft delete: a document removed from a file is still evidence that it was
  -- once on it, which matters if the file is ever taxed or disputed.
  deleted_at    timestamptz,
  deleted_by    uuid references users(id) on delete set null
);

create index if not exists matter_documents_matter_idx
  on matter_documents (matter_id, created_at desc)
  where deleted_at is null;

create index if not exists matter_documents_tenant_idx
  on matter_documents (tenant_id, created_at desc);
