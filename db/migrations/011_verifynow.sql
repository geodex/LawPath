-- 011_verifynow.sql
-- VerifyNow SA identity & compliance API integration.
-- API key stored in platform_api_provider_settings (provider = 'verifynow').
-- Credit usage tracked per-call in verifynow_usage_log (VerifyNow has no
-- dedicated balance endpoint — credits are reported in response metadata only).

create table if not exists verifynow_usage_log (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        references tenants(id) on delete set null,
  user_id       uuid        references users(id) on delete set null,
  service       text        not null,     -- 'verify', 'aml-pep', 'cipc/company', etc.
  request_id    text,                     -- VerifyNow metadata.request_id
  credits_spent numeric(10,4) not null default 0,
  latency_ms    integer,                  -- VerifyNow metadata.latency_ms
  status        text        not null default 'success'
                            check (status in ('success','error')),
  error_code    text,
  input_ref     text,                     -- sanitised input reference (e.g. masked ID)
  created_at    timestamptz not null default now()
);

create index if not exists verifynow_log_created_idx on verifynow_usage_log(created_at desc);
create index if not exists verifynow_log_tenant_idx  on verifynow_usage_log(tenant_id, created_at desc);
create index if not exists verifynow_log_service_idx on verifynow_usage_log(service, created_at desc);
