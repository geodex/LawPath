-- Per-tenant AI usage tracking for the super-admin Tenants overview.
-- Logged from server/index.js whenever callAiProvider() succeeds or fails.

create table if not exists ai_usage_log (
  id            bigserial primary key,
  tenant_id     uuid references tenants(id) on delete set null,
  user_id       uuid references users(id)   on delete set null,
  provider      text not null,                -- 'gemini' | 'openai' | 'grok'
  model         text,
  feature       text,                         -- 'ai-chat' | 'document-intelligence' | 'research-summaries' | other
  prompt_chars  integer,
  response_chars integer,
  latency_ms    integer,
  status        text not null default 'ok' check (status in ('ok', 'error')),
  error_message text,
  created_at    timestamptz not null default now()
);

create index if not exists ai_usage_log_tenant_idx  on ai_usage_log (tenant_id, created_at desc);
create index if not exists ai_usage_log_created_idx on ai_usage_log (created_at desc);
create index if not exists ai_usage_log_provider_idx on ai_usage_log (provider, created_at desc);
