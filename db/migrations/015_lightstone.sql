-- 015_lightstone.sql
-- Lightstone Property API: usage log, provider constraint extension,
-- and provider settings seed row.
--
-- APIs integrated:
--   Property-Search          (lspsearch/v1)          GET /address?query=…
--   Property-Search-Internal (lspsearch-internal/v1)  GET /address/{id}/associatedSectionalSchemeUnitsBySchemeGroupId
--
-- Auth: single Ocp-Apim-Subscription-Key (Standard subscription from portal.apis.lightstone.co.za)

-- ── Usage log ─────────────────────────────────────────────────────────────────

create table if not exists lightstone_usage_log (
  id           bigserial    primary key,
  tenant_id    uuid         references tenants(id) on delete set null,
  user_id      uuid         references users(id)   on delete set null,
  service      text         not null,               -- 'lspsearch/address' | 'lspsearch-internal/sectional'
  latency_ms   integer,
  status       text         not null default 'success'
                            check (status in ('success', 'error')),
  error_code   text,
  result_count integer,
  created_at   timestamptz  not null default now()
);

create index if not exists lightstone_usage_tenant_idx  on lightstone_usage_log (tenant_id, created_at desc);
create index if not exists lightstone_usage_created_idx on lightstone_usage_log (created_at desc);
create index if not exists lightstone_usage_service_idx on lightstone_usage_log (service, created_at desc);

-- ── Extend provider constraint to allow 'lightstone' ─────────────────────────

alter table platform_api_provider_settings
  drop constraint if exists platform_api_provider_settings_provider_check;

alter table platform_api_provider_settings
  add constraint platform_api_provider_settings_provider_check
  check (provider in ('exchangerates', 'openai', 'gemini', 'grok', 'verifynow', 'lightstone'));

-- ── Seed provider row (inactive until key is set in Super Admin) ──────────────

insert into platform_api_provider_settings (provider, display_name, active, api_key_secret_ref, notes)
values (
  'lightstone',
  'Lightstone Property API',
  false,
  '',
  'Ocp-Apim-Subscription-Key from portal.apis.lightstone.co.za — Standard subscription. Covers property address search and sectional scheme lookups.'
)
on conflict (provider) do nothing;
