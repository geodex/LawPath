-- 037_document_text.sql
-- Keep the text an analysis was drawn from.
--
-- WHY: the analyser extracted a document's text, sent it to the AI, stored the
-- seven summary fields and threw the source away. That made three things
-- impossible: comparing documents against each other, re-analysing after a
-- prompt improvement, and answering "where in the contract does it say that?".
-- A testing attorney working a client's bundle of inconsistent contracts and
-- spreadsheets needs exactly the first of those, across documents she has
-- ALREADY uploaded — so re-upload is not an acceptable answer.
--
-- Storing it is the firm's own client data, in the firm's own tenant-scoped
-- table, under the same retention regime as the rest of the matter file. The
-- text already travels to a third-party AI processor at analysis time, so the
-- marginal POPIA exposure of retaining it is small against the capability
-- gained. Approved by the practitioner who owns that call.
--
--   extracted_text        the text the analysis was actually run on (post-OCR,
--                         post-spreadsheet-flattening) — not the raw file
--   extracted_chars       length of the ORIGINAL extraction before any cap, so
--                         a partial analysis can be identified after the fact
--   text_truncated        whether the cap was hit (see DOC_TEXT_MAX_CHARS)
--
-- Deliberately no full-text index: this column is read by primary key for a
-- named set of documents, never searched across. legal_corpus_documents is the
-- searchable corpus; this is evidence, not a haystack.
--
-- Additive and idempotent.

alter table document_analyses add column if not exists extracted_text  text;
alter table document_analyses add column if not exists extracted_chars integer;
alter table document_analyses add column if not exists text_truncated  boolean not null default false;

-- Which of a tenant's documents can take part in a comparison at all.
create index if not exists doc_analyses_has_text_idx
  on document_analyses(tenant_id, created_at desc)
  where extracted_text is not null;
