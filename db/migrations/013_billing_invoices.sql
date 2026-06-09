-- 013_billing_invoices.sql
-- Full billing pipeline: invoice line items, payment tracking, enhanced invoices.
-- Links time_entries → invoice_line_items → invoices → invoice_payments.

-- ── FK: time_entries.invoice_id → invoices ───────────────────────────────────
-- invoice_id already exists as a plain uuid column (added in 006). Add the FK.
alter table time_entries
  add constraint fk_time_entries_invoice
  foreign key (invoice_id) references invoices(id) on delete set null;

-- ── Expand invoices table ─────────────────────────────────────────────────────
alter table invoices
  add column if not exists subtotal_cents        bigint       not null default 0,
  add column if not exists vat_cents             bigint       not null default 0,
  add column if not exists matter_ref            text,
  add column if not exists notes                 text,
  add column if not exists terms                 text         not null default 'Payment is due within 30 days of invoice date. Interest at 2% per month accrues on overdue amounts. Our banking details appear above.',
  add column if not exists payment_ref           text,
  add column if not exists sent_at               timestamptz,
  add column if not exists pdf_gcs_uri           text,
  add column if not exists accounting_synced_at  timestamptz,
  add column if not exists accounting_provider   text;

create index if not exists invoices_tenant_status_idx
  on invoices(tenant_id, status, created_at desc);

-- ── Invoice line items ────────────────────────────────────────────────────────
-- One row per time entry (or manually entered line). Denormalised for PDF/display.
create table if not exists invoice_line_items (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references tenants(id) on delete cascade,
  invoice_id       uuid        not null references invoices(id) on delete cascade,
  time_entry_id    uuid        references time_entries(id) on delete set null,
  description      text        not null,
  activity_type    text,
  fee_earner_name  text,
  entry_date       date,
  duration_minutes integer     not null default 0,
  rate_cents       bigint      not null default 0,
  amount_cents     bigint      not null default 0,
  vat_cents        bigint      not null default 0,
  is_disbursement  boolean     not null default false,
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx on invoice_line_items(invoice_id);
create index if not exists invoice_items_tenant_idx  on invoice_line_items(tenant_id);

-- ── Invoice payments (supports partial payments) ──────────────────────────────
create table if not exists invoice_payments (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references tenants(id) on delete cascade,
  invoice_id      uuid        not null references invoices(id) on delete cascade,
  amount_cents    bigint      not null check (amount_cents > 0),
  payment_date    date        not null default current_date,
  payment_method  text        not null default 'EFT'
                              check (payment_method in ('EFT','Cash','Card','Cheque','Trust transfer','Other')),
  reference       text,
  notes           text,
  created_by      uuid        references users(id),
  created_at      timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_idx on invoice_payments(invoice_id);
create index if not exists invoice_payments_tenant_idx  on invoice_payments(tenant_id, created_at desc);
