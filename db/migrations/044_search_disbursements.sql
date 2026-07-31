-- 044_search_disbursements.sql
-- Recover searches from the client as disbursements on the matter's invoice.
--
-- A search run on a matter is a cash expense the firm incurred for that client.
-- Until now it was recorded and charged to the firm's wallet, but there was no
-- link from the search to the invoice that recovers it, so recovery was manual
-- re-typing — and anything re-typed eventually gets missed, which is money the
-- firm simply loses.
--
-- `invoice_id` is the double-billing guard: a search carries the invoice that
-- recovered it, so it can never be added to a second one. Unbilled searches for
-- a matter are exactly those where it is null.
--
-- Additive only.

alter table matter_searches
  add column if not exists invoice_id  uuid references invoices(id) on delete set null,
  add column if not exists invoiced_at timestamptz;

-- Drives "what is recoverable on this matter" — the unbilled, successful,
-- matter-linked searches.
create index if not exists matter_searches_unbilled_idx
  on matter_searches (tenant_id, matter_id)
  where invoice_id is null and status = 'success' and matter_id is not null;

create index if not exists matter_searches_invoice_idx
  on matter_searches (invoice_id)
  where invoice_id is not null;

-- Ties a disbursement line back to the search that produced it, so an invoice
-- line can be traced to the actual search record on a taxation of costs.
alter table invoice_line_items
  add column if not exists search_id uuid references matter_searches(id) on delete set null;
