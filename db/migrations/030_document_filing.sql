-- 030_document_filing.sql
-- Filing metadata for Document Intelligence.
--
-- document_analyses.matter_id already exists (026). This adds the surrounding
-- facts: what the uploader typed, when it was filed, by whom, and HOW it came to
-- be filed.
--
--   matter_ref     what the uploader typed. Preserved even when it resolves to
--                  no matter, so the intent is not lost and can be re-linked
--                  later. (The analyse endpoint already accepted this field and
--                  silently discarded it.)
--   filing_source  'upload' - the uploader named the matter (strongest signal)
--                  'auto'   - matched from extracted parties, unambiguously
--                  'manual' - an attorney filed it afterwards
--                  Keeping these distinct matters: an auto-filed document is a
--                  guess a human should be able to spot and correct.
--
-- Additive only.

alter table document_analyses
  add column if not exists matter_ref     text,
  add column if not exists filed_at       timestamptz,
  add column if not exists filed_by       uuid references users(id) on delete set null,
  add column if not exists filing_source  text
    check (filing_source is null or filing_source in ('upload','auto','manual'));
