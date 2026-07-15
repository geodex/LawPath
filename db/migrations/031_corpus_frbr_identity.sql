-- 031_corpus_frbr_identity.sql
-- Give every corpus document a verifiable identity.
--
-- WHY: a testing attorney was given a fabricated citation and stopped using the
-- product. 99b1f6e grounded the chat in the corpus and made it verify every
-- citation, which was necessary but not sufficient — the corpus itself could not
-- name what it held. ~8,955 of 9,460 rows had no citation, no source_url, and a
-- synthetic title ("Judgment — Supreme Court of Appeal", "Untitled judgment").
--
-- ROOT CAUSE: the Laws.Africa AI KB returns identity under `metadata`
-- (work_frbr_uri, title, expression_date, public_url, frbr_doctype), but
-- server/saflii.js read item.public_url / item.url / item.title at the TOP
-- level. All undefined. Every field needed arrived on every call and was
-- discarded; only item.content.text was read at the right depth.
--
-- Handed a real summary of a real case titled "Judgment — Supreme Court of
-- Appeal" with no citation, and instructed to cite only from sources, the model
-- has nothing to cite and falls back on recall. That is how a grounded assistant
-- still produces an invented citation.
--
-- This migration adds the identity column the indexer should have been writing
-- all along, plus the unique index that makes dedup possible. Additive only.
--
--   frbr_uri  the work-level Akoma Ntoso URI, e.g. /akn/za/judgment/zasca/2025/162
--             Court, year and number are derivable from it deterministically, so
--             the citation ([2025] ZASCA 162) is a parse, never a guess. It is
--             the work URI (not the expression URI) so that the same judgment in
--             a different language/date collapses onto one row.

alter table legal_corpus_documents add column if not exists frbr_uri text;

-- The dedup key the indexer never had. saflii.js dedupes on source_url inside
-- `if (publicUrl)`, so when public_url came back undefined the check was skipped
-- entirely and every run re-inserted everything the previous run had fetched:
-- 8,955 rows holding only 1,701 distinct texts (~81% duplicates).
--
-- Partial so the 504 curated seed rows (which have citations + real SAFLII URLs
-- but no FRBR URI) are unaffected and keep working.
create unique index if not exists corpus_docs_frbr_uri_key
  on legal_corpus_documents(frbr_uri) where frbr_uri is not null;

-- Retrieval and the citation verifier both filter on court; the indexer's
-- guessed courts made that unreliable. Index it for the coverage panel.
create index if not exists corpus_docs_court_idx on legal_corpus_documents(court);
