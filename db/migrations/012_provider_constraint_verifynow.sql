-- 012_provider_constraint_verifynow.sql
-- The platform_api_provider_settings table was created with a hardcoded CHECK
-- constraint: provider in ('exchangerates','openai','gemini','grok').
-- Inserting provider='verifynow' violates this and causes the entire API
-- settings save to fail. This migration extends the allowed set.

alter table platform_api_provider_settings
  drop constraint if exists platform_api_provider_settings_provider_check;

alter table platform_api_provider_settings
  add constraint platform_api_provider_settings_provider_check
  check (provider in ('exchangerates', 'openai', 'gemini', 'grok', 'verifynow'));
