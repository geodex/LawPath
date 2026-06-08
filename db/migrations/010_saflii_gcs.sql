-- 010_saflii_gcs.sql
-- GCS storage columns for SAFLII corpus + full-text search index

alter table legal_corpus_documents
  add column if not exists gcs_uri      text,
  add column if not exists gcs_html_uri text;

-- Full-text search vector: generated column on title + citation + summary + snippet.
-- Uses 'english' dictionary; immutable so safe for GENERATED ALWAYS AS STORED.
alter table legal_corpus_documents
  add column if not exists content_tsv tsvector
  generated always as (
    to_tsvector('english',
      coalesce(title,'') || ' ' ||
      coalesce(citation,'') || ' ' ||
      coalesce(summary,'') || ' ' ||
      coalesce(full_text_snippet,'')
    )
  ) stored;

create index if not exists corpus_docs_fts_idx on legal_corpus_documents using gin(content_tsv);
create index if not exists corpus_docs_gcs_idx  on legal_corpus_documents(gcs_uri) where gcs_uri is not null;
