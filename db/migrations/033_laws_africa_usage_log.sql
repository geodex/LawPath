-- 033_laws_africa_usage_log.sql
-- Per-call log for the Laws.Africa Knowledge Base API.
--
-- WHY: the Sandbox plan allows 100 calls/day, and from now the calls come from
-- two competing consumers — the nightly indexer batch AND live research
-- retrieval at question time (an attorney's own words are a better KB query
-- than any canned topic, so research queries the KB live and caches the
-- identified results through the same upsert the indexer uses). A shared budget
-- needs a shared meter; this is it. server/live-research.js refuses to place a
-- call once today's count reaches the cap and research degrades to local-only,
-- rather than the API starting to 429.
--
-- Follows the shape of verifynow_usage_log / lightstone_usage_log. No tenant_id:
-- the corpus is a platform asset (legal_corpus_* carry no tenant_id either) and
-- the query text an attorney types is potentially privileged — it is NOT stored
-- here for that reason. query_kind records what sort of call it was; that is
-- enough for budgeting and for the coverage panel.

create table if not exists laws_africa_usage_log (
  id          uuid        primary key default gen_random_uuid(),
  query_kind  text        not null check (query_kind in ('indexer','live-research','citation-lookup')),
  kb_code     text        not null default 'judgments-za',
  results     integer     not null default 0,   -- items the API returned
  new_docs    integer     not null default 0,   -- rows added to the corpus
  upgraded    integer     not null default 0,   -- thin rows upgraded in place
  status      text        not null default 'success' check (status in ('success','error')),
  error_code  text,
  created_at  timestamptz not null default now()
);

create index if not exists laws_africa_log_created_idx on laws_africa_usage_log(created_at desc);
