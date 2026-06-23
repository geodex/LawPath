-- 021_searchworks.sql
-- SearchWorks (searchworks.co.za) Deeds Office data + DOTS tracking.
-- Distribution channels available: direct (searchworks.co.za) and Standard Bank
-- OneHub API Marketplace. Final auth/base URL/endpoints come from the
-- SearchWorks onboarding pack; this migration prepares the storage + audit log.
--
-- Services LawPath proxies through to attorneys:
--   deeds-search            Deeds Office search (live or offline tier)
--   property-history        Current + previous owners across erf/farm/sectional
--   document-retrieval      T / B / BC / ST / SBC / SB / I / H deed documents
--   dots-track              DOTS — real-time pending registration status
--   dots-alert-subscribe    Email alerts on Deeds Office status change
--   property-info           Generic property attributes
--
-- Auth (placeholder until SearchWorks supplies the spec):
--   Bearer <api_key> via Authorization header, single key per tenant platform.
--   Stored in platform_api_provider_settings (provider = 'searchworks').

-- ── Usage log ─────────────────────────────────────────────────────────────────

create table if not exists searchworks_usage_log (
  id            bigserial   primary key,
  tenant_id     uuid        references tenants(id) on delete set null,
  user_id       uuid        references users(id)   on delete set null,
  service       text        not null,            -- 'deeds-search' | 'property-history' | etc.
  input_ref     text,                            -- erf/title-deed/owner ref used as input
  credits_spent integer     not null default 0,  -- ZAR cents or unit count, per SearchWorks meter
  latency_ms    integer,
  status        text        not null default 'success'
                            check (status in ('success', 'error')),
  error_code    text,
  result_count  integer,
  created_at    timestamptz not null default now()
);

create index if not exists searchworks_usage_tenant_idx  on searchworks_usage_log (tenant_id, created_at desc);
create index if not exists searchworks_usage_created_idx on searchworks_usage_log (created_at desc);
create index if not exists searchworks_usage_service_idx on searchworks_usage_log (service, created_at desc);

-- ── Extend provider constraint to allow 'searchworks' ────────────────────────

alter table platform_api_provider_settings
  drop constraint if exists platform_api_provider_settings_provider_check;

alter table platform_api_provider_settings
  add constraint platform_api_provider_settings_provider_check
  check (provider in ('exchangerates', 'openai', 'gemini', 'grok', 'verifynow', 'lightstone', 'searchworks'));

-- ── Seed provider row (inactive until key is set in Super Admin) ──────────────

insert into platform_api_provider_settings (provider, active, api_key_secret_ref)
values ('searchworks', false, '')
on conflict (provider) do nothing;
