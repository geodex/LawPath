# Matter Spine — implementation plan

Status: **APPROVED FOR DESIGN — not yet approved for execution.**
Owner sign-off required before writing migration `026` or running any backfill.

Roadmap ref: Phase 1 "Matter spine" + "Matter File view" (see
`docs/memory/product_roadmap.md`). This is the one genuinely risky change in the
roadmap: the production DB serves real SA firms with live trust and client data.

## Goal

Unify the free-text `matterRef` strings into a real `matter_id` FK spine so one
file joins **time + trust + invoices + FICA + documents**. Every AI feature gets
better once the AI sees a whole file instead of fragments.

## Decisions (owner-approved 2026-07-14)

1. **Canonical table: promote the existing `matters` table.** Not a new table.
2. **Domain link: add a clean `matter_id` column** on `litigation_matters` and
   `conveyancing_matters` (do NOT reuse the dead `conveyancing_matters.linked_matter_id`).

## Starting point — the schema is already ~60% there

Three of the five leaf tables already carry a `matter_id`:

| Table | `matter_id` today | Free-text ref today |
|---|---|---|
| `invoices` | `uuid` **+ FK → matters(id)** | `invoice_number` |
| `time_entries` | `uuid` (nullable, no FK) | `matter_ref` (free text) |
| `trust_transactions` | `uuid` (nullable, no FK) | `reference`, `client_name` |
| `fica_clients` | `uuid` (nullable, no FK) | `client_name` |
| `document_analyses` | none | `file_name`, `parties[]` |

Three "matter" tables exist today:

- `matters` — general/CRM, auto-numbered `M-######`, feeds the dashboard, is the
  FK target of `invoices.matter_id`. **← the spine.**
- `litigation_matters` — own `matter_ref`, not linked to `matters`.
- `conveyancing_matters` — own `matter_ref`, not linked to `matters`.
  Has a dead `linked_matter_id` column (unused everywhere) — left alone.

`matters` columns: `id, tenant_id, matter_number (unique per tenant), title,
client_name, client_role, matter_type, stage, progress, next_step, due_date,
risk, portal_access_enabled, created_by, created_at, updated_at`.

## Phase A — migration `026_matter_spine.sql` (additive only, reversible)

No data touched. Adds the missing columns + NOT VALID FKs + indexes.

```sql
-- add matter_id where missing (clean column on the domain tables)
alter table document_analyses    add column if not exists matter_id uuid;
alter table litigation_matters   add column if not exists matter_id uuid;
alter table conveyancing_matters add column if not exists matter_id uuid;

-- FKs added NOT VALID: no full-table lock and no validation scan on the live
-- table. VALIDATE later in a quiet window, or never — the app tolerates NULL
-- matter_id everywhere already, so integrity is app-enforced in the interim.
alter table time_entries        add constraint te_matter_fk foreign key (matter_id) references matters(id) on delete set null not valid;
alter table trust_transactions  add constraint tt_matter_fk foreign key (matter_id) references matters(id) on delete set null not valid;
alter table fica_clients        add constraint fc_matter_fk foreign key (matter_id) references matters(id) on delete set null not valid;
alter table document_analyses   add constraint da_matter_fk foreign key (matter_id) references matters(id) on delete set null not valid;
alter table litigation_matters  add constraint lm_matter_fk foreign key (matter_id) references matters(id) on delete set null not valid;
alter table conveyancing_matters add constraint cm_matter_fk foreign key (matter_id) references matters(id) on delete set null not valid;

-- indexes for the Matter File joins
create index if not exists te_matter_idx on time_entries(matter_id) where matter_id is not null;
create index if not exists tt_matter_idx on trust_transactions(matter_id) where matter_id is not null;
create index if not exists fc_matter_idx on fica_clients(matter_id) where matter_id is not null;
create index if not exists da_matter_idx on document_analyses(matter_id) where matter_id is not null;
create index if not exists lm_matter_idx on litigation_matters(matter_id) where matter_id is not null;
create index if not exists cm_matter_idx on conveyancing_matters(matter_id) where matter_id is not null;

-- audit table for a fully reversible backfill (Phase B writes here)
create table if not exists matter_backfill_log (
  id          bigserial primary key,
  run_id      uuid not null,
  table_name  text not null,
  row_id      text not null,
  old_matter_id uuid,
  new_matter_id uuid not null,
  matched_on  text not null,
  created_at  timestamptz not null default now()
);
```

Reversibility: drop the columns/constraints/indexes; the audit table replays a
rollback of any backfilled `matter_id`.

`026` is the next migration number (024 = prescription, 025 = DOTS).
Per the guardrails: additive only, never edit an applied migration.

## Phase B — backfill script `server/matter-backfill.js` (manual, dry-run first)

**Not** run by `deploy.sh`. Invoked manually like the SAFLII first run, with a
`--dry-run` default and an explicit `--commit` to write. Idempotent. Every write
goes to `matter_backfill_log` for rollback. **Only ever sets `matter_id` where it
is currently NULL — never rewrites, deletes, or touches any other column.**

- **B1 — promote domain matters into the spine.** For each `litigation_matters`
  / `conveyancing_matters` row with `matter_id IS NULL`: insert a `matters` row
  (`matter_number = matter_ref`, `title`/`client_name`/`matter_type` derived from
  the domain row, `tenant_id` preserved) and set the domain row's `matter_id`.
  Uses `matters (tenant_id, matter_number)` uniqueness to stay idempotent — a
  re-run reuses the existing spine row.
  **The client comes from `acting_for` (migration 027), never a guess.** A firm
  acts for either side, so `client_name` resolves as: litigation →
  plaintiff/defendant; conveyancing → seller_name/buyer_name/bond_bank.
  `client_role` is set from `acting_for`. Matters with no `acting_for` are
  skipped and reported — an attorney sets it in the UI, then the (idempotent)
  backfill is re-run to pick them up. This is why the spine cannot be backfilled
  in one shot: it converges as the firm states who it acts for.
- **B2 — link the leaf tables**, per tenant, WHERE `matter_id IS NULL`:
  - `time_entries.matter_ref` → `matters.matter_number` (exact), then domain
    `matter_ref` (→ that domain row's spine `matter_id` from B1).
  - `trust_transactions.reference`/`client_name` → `matters`.
  - `fica_clients.client_name` → `matters.client_name`.
  - `document_analyses` → best-effort via `parties[]`/`file_name` (lowest
    confidence — expect many to remain NULL; that's fine).
- **Output:** per-table match rate + count left NULL. Unmatched rows stay NULL;
  the app already tolerates NULL `matter_id` everywhere today.

Rollback: `node server/matter-backfill.js --rollback <run_id>` replays the audit
log, setting each `new_matter_id` back to its `old_matter_id` (NULL) and deleting
any `matters` rows created in B1 that have no other references.

## Phase C — Matter File view (additive, read-only first)

One page per `matters.id`: tabs Overview / Parties & FICA / Money (time + trust +
invoices) / Documents / Correspondence / Diary. Joined by `matter_id`, with a
fallback to the string refs so un-backfilled rows still populate during the
transition. New route + component; no writes in v1.

## Risk posture

- Additive columns + NOT VALID FKs = no locks, no validation scans, no rewrites
  on the live DB.
- Backfill is manual, dry-run-first, NULL-only, logged, and reversible.
- `npx tsc --noEmit` clean before every push; one feature per commit; owner runs
  all deploy/backfill commands.

## Execution order (each its own commit, stop + deploy between)

1. Migration `026` (Phase A). Deploy. Verify columns exist, app boots.
2. Backfill script (Phase B) — ship the script, run `--dry-run` on prod, review
   match rates together, then `--commit` when happy.
3. Matter File view (Phase C).

**Awaiting owner sign-off to begin step 1.**
