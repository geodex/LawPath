-- 038_document_comparisons.sql
-- Comparative analysis across several documents already on the file.
--
-- WHY: a practitioner working a client's bundle — a dozen contracts signed
-- over years plus the spreadsheets that track them — is not asking "what does
-- this document say?" but "where do these DISAGREE?". Different renewal terms
-- for the same relationship, an escalation clause that changed without anyone
-- noticing, a spreadsheet date that contradicts the contract it tracks. Those
-- are findings no single-document analysis can produce, because the finding
-- IS the divergence between documents.
--
-- Stored rather than computed on demand for two reasons: the call is expensive
-- (several full contracts in one prompt), and the output is working product an
-- attorney returns to, annotates and acts on — not a transient view.
--
-- document_ids is a plain uuid[] snapshot of what was compared. Deliberately
-- not a join table with FKs: a comparison is a record of an analysis performed
-- at a moment in time, and it must survive one of its inputs being deleted
-- rather than cascade away with it.
--
-- Additive and idempotent.

create table if not exists document_comparisons (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  matter_id     uuid,
  title         text not null,
  -- What the attorney asked to focus on, if anything.
  focus         text,
  document_ids  uuid[] not null default '{}',
  -- Denormalised so a comparison still reads correctly years later even if a
  -- source document has since been deleted or renamed.
  document_names text[] not null default '{}',
  status        text not null default 'Queued'
                  check (status in ('Queued', 'Analysing', 'Complete', 'Failed')),
  -- [{topic, severity, divergence, findings:[{doc, value, note}]}]
  issues        jsonb not null default '[]'::jsonb,
  -- [{description, doc, date, conflictsWith, note}] — the spreadsheet-vs-
  -- contract date cross-check the practitioner specifically asked for.
  date_conflicts jsonb not null default '[]'::jsonb,
  anomalies     text[] not null default '{}',
  notes         text,
  summary       text,
  ai_model      text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists document_comparisons_tenant_idx
  on document_comparisons(tenant_id, created_at desc);

create index if not exists document_comparisons_matter_idx
  on document_comparisons(matter_id) where matter_id is not null;
