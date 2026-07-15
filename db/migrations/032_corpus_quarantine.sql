-- 032_corpus_quarantine.sql
-- A holding table for corpus documents that cannot name themselves.
--
-- WHY: ~8,955 of 9,460 corpus rows have no citation, no source_url and no FRBR
-- URI. They are real summaries of real judgments, but nothing records WHICH
-- judgment (see 031 — the indexer read the API's identity fields at the wrong
-- nesting level and discarded every one). Their identity is not recoverable
-- from the text: across all 8,955 there are 0 case numbers and 0 neutral
-- citations, because the API returns AI-written summaries rather than raw
-- judgments.
--
-- They cannot stay. retrieveCorpusContext prefers %High Court% and %SCA%, which
-- is overwhelmingly this population, so the better retrieval works the more
-- unciteable sources it hands the model — and a model told "cite only from
-- SOURCES" and given sources with no citation falls back on recall. These rows
-- are the mechanism behind the fabricated citations, not innocent bystanders.
--
-- They are moved here rather than deleted. This is the owner's production
-- database; the rows are worthless but that is a judgement, and a judgement
-- should be reversible. server/corpus-quarantine.js --restore <run_id> puts any
-- run back exactly as it was.
--
-- `including defaults` and NOT `including all` on purpose: no primary key and no
-- unique indexes here. Quarantine must accept the ~81% duplicate rows as-is
-- (8,955 rows hold only 1,701 distinct texts) without a constraint rejecting
-- them mid-move.

create table if not exists legal_corpus_quarantine (
  like legal_corpus_documents including defaults,
  quarantine_run_id  uuid        not null,
  quarantine_reason  text        not null,
  quarantined_at     timestamptz not null default now()
);

create index if not exists corpus_quarantine_run_idx on legal_corpus_quarantine(quarantine_run_id);

-- Every move is logged so a restore can be reasoned about after the fact, and so
-- "what did we throw away, and why" has an answer that is not someone's memory.
create table if not exists legal_corpus_quarantine_runs (
  run_id        uuid primary key,
  reason        text        not null,
  rows_moved    integer     not null default 0,
  restored_at   timestamptz,
  created_at    timestamptz not null default now()
);
