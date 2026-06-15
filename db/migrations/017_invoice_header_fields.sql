-- Add per-tenant invoice header field preferences to tenant_profiles
-- Stores an ordered JSON array of field keys that appear in the print header.
-- Valid values: "address", "phone", "website", "vatNumber", "lpcNumber"
-- NULL means "show all fields in default order" (backward compatible).
alter table tenant_profiles
  add column if not exists invoice_header_fields jsonb;
