-- 026_matter_spine.sql
-- Matter spine, Phase A (additive only). See docs/matter-spine-plan.md.
--
-- Promotes the existing `matters` table to the canonical matter and links every
-- leaf table to it by matter_id. This migration ONLY adds nullable columns, FK
-- constraints (NOT VALID, so no lock-heavy validation scan on the live tables),
-- indexes, and a backfill audit table. It touches no existing row.
--
-- Already present before this migration (left as-is):
--   invoices.matter_id            uuid + FK -> matters(id)
--   time_entries.matter_id        uuid (nullable, no FK)
--   trust_transactions.matter_id  uuid (nullable, no FK)
--   fica_clients.matter_id        uuid (nullable, no FK)
--
-- The actual data backfill is a separate, manual, dry-run-first script
-- (server/matter-backfill.js) writing to matter_backfill_log for reversibility.
-- Nothing in this file writes data.

-- ── New matter_id columns where missing (clean column on the domain tables) ──
alter table document_analyses    add column if not exists matter_id uuid;
alter table litigation_matters   add column if not exists matter_id uuid;
alter table conveyancing_matters add column if not exists matter_id uuid;

-- ── FK constraints (NOT VALID). Guarded so a re-run cannot error. ────────────
do $$
begin
  begin
    alter table time_entries add constraint te_matter_fk
      foreign key (matter_id) references matters(id) on delete set null not valid;
  exception when duplicate_object then null; end;

  begin
    alter table trust_transactions add constraint tt_matter_fk
      foreign key (matter_id) references matters(id) on delete set null not valid;
  exception when duplicate_object then null; end;

  begin
    alter table fica_clients add constraint fc_matter_fk
      foreign key (matter_id) references matters(id) on delete set null not valid;
  exception when duplicate_object then null; end;

  begin
    alter table document_analyses add constraint da_matter_fk
      foreign key (matter_id) references matters(id) on delete set null not valid;
  exception when duplicate_object then null; end;

  begin
    alter table litigation_matters add constraint lm_matter_fk
      foreign key (matter_id) references matters(id) on delete set null not valid;
  exception when duplicate_object then null; end;

  begin
    alter table conveyancing_matters add constraint cm_matter_fk
      foreign key (matter_id) references matters(id) on delete set null not valid;
  exception when duplicate_object then null; end;
end $$;

-- ── Indexes for the Matter File joins ───────────────────────────────────────
create index if not exists te_matter_idx on time_entries(matter_id)        where matter_id is not null;
create index if not exists tt_matter_idx on trust_transactions(matter_id)  where matter_id is not null;
create index if not exists fc_matter_idx on fica_clients(matter_id)         where matter_id is not null;
create index if not exists da_matter_idx on document_analyses(matter_id)    where matter_id is not null;
create index if not exists lm_matter_idx on litigation_matters(matter_id)   where matter_id is not null;
create index if not exists cm_matter_idx on conveyancing_matters(matter_id) where matter_id is not null;

-- ── Backfill audit log (Phase B writes here; enables a clean rollback) ───────
create table if not exists matter_backfill_log (
  id            bigserial primary key,
  run_id        uuid not null,
  table_name    text not null,
  row_id        text not null,
  old_matter_id uuid,
  new_matter_id uuid not null,
  matched_on    text not null,
  created_at    timestamptz not null default now()
);

create index if not exists matter_backfill_log_run_idx on matter_backfill_log(run_id);
