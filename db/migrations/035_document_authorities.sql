-- 035_document_authorities.sql
-- Verified case-law authorities attached to the concerns a document raises.
--
-- WHY: Document Intelligence was the last ungrounded AI surface in the product.
-- Research was rebuilt in L5/L6 to be trustworthy by architecture — grounded in
-- the corpus, every citation verified, honest not-founds — after a testing
-- attorney was handed a fabricated citation and stopped using the tool. But
-- document analysis kept asserting South African law from model recall alone:
-- "voetstoots concern" with no authority, no citation, nothing to read.
--
-- This column holds, per flag, the authorities that actually bear on it —
-- selected from rows that already exist in legal_corpus_documents, so a
-- citation here cannot be invented. The model is never asked to produce a
-- citation, only to choose among real ones and say why; anything it names that
-- is not in the supplied candidate set is discarded before storage.
--
-- Shape:
--   [ { "flag": "Voetstoots clause with no disclosure schedule",
--       "kind": "risk" | "sa_law",
--       "authorities": [ { "citation": "[2024] ZASCA 90",
--                          "title": "...", "court": "...", "year": 2024,
--                          "sourceUrl": "https://lawlibrary.org.za/...",
--                          "note": "why this bears on the flag" } ] } ]
--
-- jsonb, not a table: these are read as a whole with the analysis and never
-- queried across documents. Additive and idempotent.

alter table document_analyses
  add column if not exists authorities jsonb not null default '[]'::jsonb;
