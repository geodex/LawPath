-- 042_wallet_auto_topup.sql
-- Assisted top-up when a wallet runs low.
--
-- WHY THIS IS NOT A TRUE AUTO TOP-UP: Yoco does not support recurring billing
-- or merchant-initiated charges — there is no card-on-file we may charge without
-- the firm present. So "auto top-up" here means the low-balance email carries a
-- ready-made checkout for the firm's chosen amount: one click, card details
-- entered on Yoco's page, done. Everything except the card entry is automatic.
--
-- If Yoco ships card-on-file, the only change needed is charging the token
-- instead of emailing the link — the amount preference, the trigger and the
-- ledger already work.
--
-- Additive only.

alter table tenant_search_wallets
  -- When on, a low balance emails a prepared top-up link rather than only a warning.
  add column if not exists auto_topup_enabled     boolean not null default false,
  -- The amount that link is made out for.
  add column if not exists auto_topup_amount_cents integer not null default 50000  -- R500
    check (auto_topup_amount_cents >= 0);

-- Prepared checkouts, so a link can be reconciled to the wallet it was made for
-- and a stale one is never honoured twice.
create table if not exists wallet_topup_intents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  checkout_id  text not null,
  amount_cents integer not null check (amount_cents > 0),
  -- 'auto' was raised by a low balance; 'manual' by someone pressing top up.
  origin       text not null default 'manual' check (origin in ('manual', 'auto')),
  status       text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);

create unique index if not exists wallet_topup_intents_checkout_idx
  on wallet_topup_intents (checkout_id);

create index if not exists wallet_topup_intents_tenant_idx
  on wallet_topup_intents (tenant_id, created_at desc);
