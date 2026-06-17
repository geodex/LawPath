-- Add a features column to track which AI features each provider handles.
-- A feature string (e.g. 'ai-chat') appears in exactly one provider's array.
alter table platform_api_provider_settings
  add column if not exists features text[] not null default '{}';

-- Seed: assign all AI features to gemini by default (can be changed in Settings UI)
update platform_api_provider_settings
  set features = array['ai-chat', 'document-intelligence', 'research-summaries']
  where provider = 'gemini';

-- Fix stale model names stored from earlier versions
update platform_api_provider_settings
  set default_model = 'gemini-3.5-flash'
  where provider = 'gemini'
    and default_model not in ('gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite');

update platform_api_provider_settings
  set default_model = 'gpt-5.4-mini'
  where provider = 'openai'
    and default_model not in ('gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano');

update platform_api_provider_settings
  set default_model = 'grok-4.3'
  where provider = 'grok'
    and default_model not in ('grok-4.3');
