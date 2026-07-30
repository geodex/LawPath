-- 041_search_wallet.sql
-- Prepaid search wallet: firms buy search credit from us, we buy credits from
-- VerifyNow / SearchWorks, and the margin (040) is ours.
--
-- DENOMINATED IN RAND CENTS, NOT IN ABSTRACT CREDITS. A firm sees "R450.00
-- remaining"; a search costs "R44.70"; the disbursement recovered from the
-- client is that same R44.70. An abstract LawPath credit would need a
-- conversion rate per provider anyway (a VerifyNow credit and a SearchWorks
-- credit are different things and priced differently), and it would hide the
-- one number an attorney actually needs for a bill of costs.
--
-- THE LEDGER IS THE TRUTH. `balance_cents` is a running total maintained in the
-- same transaction as its ledger row — never written on its own. Any balance
-- can therefore be re-derived and audited, which matters because this is client
-- money adjacent: a firm recharges these amounts to its clients.
--
-- Additive only.

create table if not exists tenant_search_wallets (
  tenant_id                   uuid primary key references tenants(id) on delete cascade,
  -- May go negative: if a provider call succeeds we have already been charged,
  -- so the firm owes it. Recording the debt beats losing it.
  balance_cents               bigint      not null default 0,
  low_balance_threshold_cents integer     not null default 20000  -- R200
                              check (low_balance_threshold_cents >= 0),
  -- Set when a low-balance warning goes out; cleared on top-up, so one warning
  -- per depletion rather than one per search.
  low_balance_notified_at     timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table if not exists tenant_search_wallet_ledger (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  entry_type          text not null
                      check (entry_type in ('topup', 'search', 'refund', 'adjustment', 'opening')),
  -- Signed: positive credits the wallet, negative debits it.
  amount_cents        bigint not null,
  balance_after_cents bigint not null,
  search_id           uuid references matter_searches(id) on delete set null,
  -- Payment reference for a top-up (Yoco checkout or payment id). Unique, so a
  -- replayed webhook cannot credit the same payment twice.
  payment_ref         text,
  description         text not null,
  created_by          uuid references users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists wallet_ledger_tenant_idx
  on tenant_search_wallet_ledger (tenant_id, created_at desc);

-- Money-in idempotency: one credit per payment, enforced by the database rather
-- than by remembering to check.
create unique index if not exists wallet_ledger_payment_ref_idx
  on tenant_search_wallet_ledger (payment_ref)
  where payment_ref is not null;

create index if not exists wallet_ledger_search_idx
  on tenant_search_wallet_ledger (search_id)
  where search_id is not null;

-- ── Enforcement switch ───────────────────────────────────────────────────────
-- OFF by default and deliberately so: turning enforcement on the moment this
-- deploys would stop every search for every existing firm, mid-matter, with no
-- way to top up until the payment flow is live. While it is off the ledger still
-- records every debit, so balances (and any debt) are real from day one and the
-- switch can be flipped once firms can actually pay.
alter table platform_pricing_config
  add column if not exists enforce_search_wallet boolean not null default false;

-- Every existing tenant gets a wallet so nothing has to special-case its absence.
insert into tenant_search_wallets (tenant_id)
select id from tenants
on conflict (tenant_id) do nothing;
