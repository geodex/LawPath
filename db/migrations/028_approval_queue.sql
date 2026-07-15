-- 028_approval_queue.sql
-- One approval queue for everything that leaves the firm or moves money.
--
-- The firm works together: a secretary drafts, an attorney approves. AI drafts
-- land in the SAME queue — nothing AI-generated should reach a client or a bank
-- without an admitted attorney signing it off (LPC-defensible, and the standing
-- product guardrail).
--
-- Deliberate design points:
--   * `origin` marks whether a human or the AI drafted it, so AI output is never
--     silently indistinguishable from an attorney's own work.
--   * Approving does NOT execute the action. This table records the DECISION;
--     the owning module performs the act and then marks the row 'actioned'.
--     An approval queue that also fires the payment is a queue that can pay the
--     wrong person because of a UI bug.
--   * decided_by is always recorded alongside requested_by, so self-approval is
--     visible rather than hidden (it is legitimate for a sole practitioner and
--     a red flag in a larger firm — the record lets a reviewer tell).
--
-- Additive only.

create table if not exists approval_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  matter_id     uuid references matters(id) on delete set null,
  kind          text not null check (kind in ('invoice','document','trust_payment','client_message','time_entry','other')),
  title         text not null,
  summary       text,
  -- What will happen on approval, and/or the drafted content itself.
  payload       jsonb not null default '{}',
  -- Optional pointer to the row this request concerns.
  entity_type   text,
  entity_id     uuid,
  -- For money items, so the queue can show value without parsing payload.
  amount_cents  bigint,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','withdrawn','actioned')),
  origin        text not null default 'human' check (origin in ('human','ai')),
  requested_by  uuid references users(id) on delete set null,
  requested_at  timestamptz not null default now(),
  decided_by    uuid references users(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  actioned_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists approval_requests_queue_idx
  on approval_requests (tenant_id, status, requested_at desc);

create index if not exists approval_requests_matter_idx
  on approval_requests (matter_id) where matter_id is not null;

-- Find the approval covering a given entity (e.g. "may this invoice be sent?").
create index if not exists approval_requests_entity_idx
  on approval_requests (tenant_id, entity_type, entity_id) where entity_id is not null;
