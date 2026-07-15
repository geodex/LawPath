-- 029_matter_diary.sql
-- A diary for EVERY matter, hung off the spine.
--
-- Today only litigation matters have a diary: litigation_deadlines FKs to
-- litigation_matters. A conveyancing file or a general matter has nowhere to put
-- a date, which is why the Matter File's Diary tab is empty for them and why
-- dates extracted from documents have nowhere to land.
--
-- This does NOT replace litigation_deadlines. That table carries litigation-
-- specific meaning (rule references, days-from-service, priority) and is wired
-- into the Today feed and the litigation pipeline. Migrating it would be a
-- destructive rewrite for no gain. The Matter File reads both.
--
-- `source` records where an entry came from, so an AI- or document-derived date
-- is never indistinguishable from one an attorney diarised themselves.
--
-- Additive only.

create table if not exists matter_diary_entries (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  matter_id          uuid not null references matters(id) on delete cascade,
  description        text not null,
  due_date           date not null,
  note               text,
  source             text not null default 'manual'
                     check (source in ('manual','document','ai','rule_engine')),
  -- When source = 'document', which document the date was extracted from.
  source_document_id uuid references document_analyses(id) on delete set null,
  completed          boolean not null default false,
  completed_at       timestamptz,
  completed_by       uuid references users(id) on delete set null,
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists matter_diary_matter_idx
  on matter_diary_entries (matter_id, due_date);

-- Drives the Today sweep: outstanding entries by due date, per tenant.
create index if not exists matter_diary_due_idx
  on matter_diary_entries (tenant_id, due_date) where completed = false;
