-- AI-native assistant conversations, scoped context and audit trail.

begin;

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  agent_key text not null check (agent_key in ('general', 'drafting', 'research', 'secretary', 'billing', 'portal', 'settings')),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model text,
  context_summary text,
  created_at timestamptz not null default now()
);

create table ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  conversation_id uuid references ai_conversations(id) on delete set null,
  agent_key text not null,
  provider text not null default 'openai',
  model text,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  prompt_tokens integer,
  completion_tokens integer,
  tools_used text[] not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_ai_conversations_tenant_agent on ai_conversations(tenant_id, agent_key, updated_at desc);
create index idx_ai_messages_conversation on ai_messages(conversation_id, created_at);
create index idx_ai_agent_runs_tenant_created on ai_agent_runs(tenant_id, created_at desc);

commit;
