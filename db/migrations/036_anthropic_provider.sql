-- 036_anthropic_provider.sql
-- Allow 'anthropic' as an AI provider, and seed its row.
--
-- WHY: Claude Opus 4.8 becomes the primary provider for the reasoning-heavy
-- features this product lives on — legal research, drafted opinions, document
-- analysis and comparison. The deciding property is its 1M-token context at
-- standard pricing (no long-context premium), which is what makes analysing a
-- whole commercial lease in a single call affordable rather than theoretical.
--
-- The other providers stay configured as fallbacks. This is resilience, not
-- an ensemble: model consensus does not establish that a citation is real —
-- the corpus verifier does that (see 035). Two models agreeing on a fabricated
-- case is still a fabricated case.
--
-- Same shape as 012, which extended this constraint for 'verifynow'. The old
-- constraint is dropped and recreated because a CHECK cannot be extended in
-- place; every value previously allowed is preserved.

alter table platform_api_provider_settings
  drop constraint if exists platform_api_provider_settings_provider_check;

alter table platform_api_provider_settings
  add constraint platform_api_provider_settings_provider_check
  check (provider in (
    'exchangerates', 'openai', 'gemini', 'grok',
    'verifynow', 'lightstone', 'searchworks',
    'anthropic'
  ));

-- Seed the row so the Settings UI has something to write a key into. Inactive,
-- and the key is an empty string (the column is NOT NULL) — this migration
-- stores no credential. getAiForFeature treats an empty key as unconfigured
-- and falls through to the next provider, so seeding cannot break routing.
insert into platform_api_provider_settings (provider, api_key_secret_ref, default_model, active)
select 'anthropic', '', 'claude-opus-4-8', false
where not exists (
  select 1 from platform_api_provider_settings where provider = 'anthropic'
);
