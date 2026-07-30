-- 043_wallet_ledger_sequence.sql
-- Give the wallet ledger a deterministic order.
--
-- Entries were ordered by created_at alone. Two movements in the same
-- millisecond — a top-up immediately followed by a search, or the concurrent
-- debits we deliberately support — then come back in arbitrary order, so a
-- statement can show its running balance jumping backwards. On a document a
-- firm uses to reconcile disbursements that reads as a bug in the money.
--
-- A uuid primary key cannot break the tie (it is random), so this adds a
-- monotonic sequence. Existing rows are numbered in their recorded order.
--
-- Additive only.

alter table tenant_search_wallet_ledger
  add column if not exists seq bigserial;

create index if not exists wallet_ledger_tenant_seq_idx
  on tenant_search_wallet_ledger (tenant_id, seq desc);
