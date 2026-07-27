-- 034_matter_obligations.sql
-- Obligations extracted from a document, tracked on the matter until discharged.
--
-- WHY: Document Intelligence has always extracted an `obligations` array —
-- "the seller must maintain insurance until registration", "the tenant must
-- give 60 days' notice" — and then dropped it in a card that nobody revisits.
-- The analysis was a leaf node: it knew about a commitment the file itself
-- never heard about. This is where those commitments live so they can be
-- worked and closed off.
--
-- Why not matter_diary_entries: a diary entry REQUIRES a due_date (not null,
-- by design — it is a date-driven reminder list). Most obligations carry no
-- date at all ("maintain insurance until registration" is conditional, not
-- diarised), so forcing them into the diary would mean inventing dates. Key
-- dates still become diary entries; obligations live here, with an OPTIONAL
-- due date for the ones that do have a deadline.
--
-- This is also the substrate for the undertakings register on the roadmap: an
-- undertaking is an obligation the firm itself gave, and a missed one is a
-- conduct matter. Same table, source tells them apart.
--
-- Additive only: new table, no existing object touched. Idempotent.

create table if not exists matter_obligations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  matter_id          uuid not null references matters(id) on delete cascade,
  description        text not null,
  -- Nullable on purpose — see above. A dated obligation ALSO gets a diary
  -- entry when the attorney approves it; this column is for context.
  due_date           date,
  status             text not null default 'open'
                       check (status in ('open', 'done', 'waived')),
  -- 'document' = extracted by Doc Intelligence and approved by an attorney.
  source             text not null default 'manual'
                       check (source in ('manual', 'document', 'ai')),
  source_document_id uuid,
  note               text,
  created_by         uuid,
  completed_at       timestamptz,
  completed_by       uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists matter_obligations_matter_idx
  on matter_obligations(matter_id, status);

create index if not exists matter_obligations_tenant_idx
  on matter_obligations(tenant_id, status, due_date);

-- Re-approving the same analysis must not duplicate its obligations. The
-- apply step is idempotent on (matter, source document, description).
create unique index if not exists matter_obligations_dedupe_idx
  on matter_obligations(matter_id, source_document_id, md5(description))
  where source_document_id is not null;
