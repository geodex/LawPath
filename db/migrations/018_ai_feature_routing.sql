-- Add a features column to track which AI features each provider handles.
-- A feature string (e.g. 'ai-chat') appears in exactly one provider's array.
alter table platform_api_provider_settings
  add column if not exists features text[] not null default '{}';

-- Seed: assign all AI features to gemini by default (can be changed in Settings UI)
update platform_api_provider_settings
  set features = array['ai-chat', 'document-intelligence', 'research-summaries']
  where provider = 'gemini';
