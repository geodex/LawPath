-- 009_production_hardening.sql
-- Production hardening: staff management, Stripe billing, notification log, bulk ops

-- ──────────────────────────────────────────────────────────────────────────────
-- STAFF MANAGEMENT
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists staff_invites (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  invited_by          uuid not null references users(id),
  email               citext not null,
  full_name           text not null,
  role                text not null check (role in ('tenant_admin','attorney','candidate_attorney','legal_secretary','billing_admin')),
  token_hash          text not null,
  expires_at          timestamptz not null default now() + interval '72 hours',
  accepted_at         timestamptz,
  status              text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  created_at          timestamptz not null default now()
);

create index if not exists staff_invites_tenant_idx on staff_invites(tenant_id, status);
create unique index if not exists staff_invites_token_idx on staff_invites(token_hash);

-- Add deactivated_at to users if not present
alter table users add column if not exists deactivated_at timestamptz;
alter table users add column if not exists job_title text;
alter table users add column if not exists phone text;

-- ──────────────────────────────────────────────────────────────────────────────
-- YOCO SUBSCRIPTION BILLING (South African payment gateway — ZAR only)
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists yoco_subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null unique references tenants(id) on delete cascade,
  yoco_checkout_id      text,
  plan                  text not null default 'solo' check (plan in ('solo','practice','firm','enterprise')),
  plan_status           text not null default 'trialing' check (plan_status in ('trialing','active','past_due','cancelled','paused')),
  trial_ends_at         timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  monthly_price_cents   integer not null default 0,
  currency              text not null default 'ZAR',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists yoco_webhook_events (
  id                uuid primary key default gen_random_uuid(),
  webhook_id        text not null unique,
  event_type        text not null,
  processed         boolean not null default false,
  error_message     text,
  raw_payload       jsonb,
  created_at        timestamptz not null default now()
);

-- Add plan/status to tenants
alter table tenants add column if not exists plan text not null default 'trial';
alter table tenants add column if not exists plan_status text not null default 'trialing';
alter table tenants add column if not exists trial_ends_at timestamptz default now() + interval '14 days';

-- ──────────────────────────────────────────────────────────────────────────────
-- NOTIFICATION LOG
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists notification_log (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references tenants(id) on delete cascade,
  notification_type   text not null,
  recipient_email     text not null,
  subject             text not null,
  status              text not null default 'queued' check (status in ('queued','sent','failed','suppressed')),
  entity_type         text,
  entity_id           uuid,
  error_message       text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists notif_log_tenant_idx on notification_log(tenant_id, created_at desc);
create index if not exists notif_log_type_idx on notification_log(notification_type, status);

-- ──────────────────────────────────────────────────────────────────────────────
-- WINDEED / PROPERTY SEARCH CACHE
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists property_search_cache (
  id                  uuid primary key default gen_random_uuid(),
  search_query        text not null,
  search_type         text not null check (search_type in ('erf','title_deed','owner_name','street_address')),
  result_count        integer not null default 0,
  results             jsonb not null default '[]',
  provider            text not null default 'windeed',
  searched_by         uuid references users(id),
  cached_at           timestamptz not null default now()
);

create index if not exists prop_search_query_idx on property_search_cache(search_query, search_type);
