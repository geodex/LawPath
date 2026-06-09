-- LawPath SA — 014_clients.sql
-- Full client/CRM table for SA legal practice management
-- Designed to satisfy FICA, LPC Rules and professional practice requirements

begin;

create table clients (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references tenants(id) on delete cascade,

  -- ── Classification ───────────────────────────────────────────────────────
  client_type           text        not null default 'natural_person'
    check (client_type in (
      'natural_person','company','close_corporation','trust',
      'partnership','non_profit','sole_proprietor','other_entity'
    )),
  client_category       text        not null default 'standard'
    check (client_category in ('vip','standard','inactive','prospect')),

  -- ── Natural person identity ───────────────────────────────────────────────
  first_name            text,
  last_name             text,
  full_name             text        not null,   -- display name; entity name or "First Last"
  sa_id_number          text,                   -- 13-digit SA ID (YYMMDD-SSSS-CAZ)
  passport_number       text,
  passport_country      text,
  date_of_birth         date,
  gender                text        check (gender in ('male','female','non_binary','prefer_not_to_say')),
  nationality           text        not null default 'South African',
  income_tax_ref        text,                   -- SARS income tax reference number

  -- ── Entity / company fields ───────────────────────────────────────────────
  registered_name       text,                   -- legal registered name (CIPC)
  trading_name          text,
  registration_number   text,                   -- CIPC / trust deed / CC number
  registration_date     date,
  vat_number            text,

  -- ── Contact details ───────────────────────────────────────────────────────
  email                 text,
  email_alt             text,
  mobile                text,
  phone_landline        text,
  whatsapp_number       text,
  preferred_contact     text        not null default 'email'
    check (preferred_contact in ('email','mobile','whatsapp','phone')),

  -- ── Physical / residential address ────────────────────────────────────────
  address_line1         text,
  address_line2         text,
  suburb                text,
  city                  text,
  province              text        check (province in (
    'Gauteng','Western Cape','Eastern Cape','KwaZulu-Natal',
    'Free State','North West','Mpumalanga','Limpopo','Northern Cape'
  )),
  postal_code           text,
  country               text        not null default 'South Africa',

  -- ── Postal address (if different from physical) ───────────────────────────
  postal_same_as_physical boolean   not null default true,
  postal_line1          text,
  postal_line2          text,
  postal_suburb         text,
  postal_city           text,
  postal_province       text,
  postal_code_post      text,

  -- ── FICA / KYC compliance (required for all SA attorneys — FICA §21) ──────
  fica_status           text        not null default 'pending'
    check (fica_status in ('pending','compliant','non_compliant','expired','exempt')),
  fica_verified_at      timestamptz,
  fica_expires_at       timestamptz,
  risk_rating           text        not null default 'unrated'
    check (risk_rating in ('low','medium','high','pep','unrated')),
  is_pep                boolean     not null default false,  -- Politically Exposed Person
  pep_details           text,
  sanctions_checked_at  timestamptz,
  sanctions_clear       boolean,
  source_of_funds       text,                   -- explanation of where funds come from
  source_of_wealth      text,                   -- longer-term wealth explanation
  nature_of_business    text,                   -- nature of the legal mandate

  -- ── Conflict of interest check (LPC Rules require check before accepting mandate) ──
  conflicts_checked     boolean     not null default false,
  conflicts_checked_at  timestamptz,
  conflicts_checked_by  text,
  conflicts_notes       text,

  -- ── Billing defaults ──────────────────────────────────────────────────────
  default_rate_cents    integer     not null default 0,   -- default hourly rate (ZAR cents)
  billing_email         text,                             -- if different from main email
  payment_terms_days    integer     not null default 30,
  credit_limit_cents    integer     not null default 0,

  -- ── Relationship management ───────────────────────────────────────────────
  relationship_partner  text,                   -- responsible attorney
  originating_attorney  text,                   -- who introduced/originated the client
  client_since          date,
  referral_source       text,                   -- referral / marketing origin
  tags                  text[]      not null default '{}',

  -- ── Client portal ─────────────────────────────────────────────────────────
  portal_email          text,
  portal_active         boolean     not null default false,

  -- ── Notes ─────────────────────────────────────────────────────────────────
  internal_notes        text,

  -- ── Soft delete ───────────────────────────────────────────────────────────
  archived_at           timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index clients_tenant_idx    on clients(tenant_id);
create index clients_fica_idx      on clients(tenant_id, fica_status);
create index clients_category_idx  on clients(tenant_id, client_category);
create index clients_archived_idx  on clients(tenant_id, archived_at);
create index clients_fts_idx       on clients using gin(to_tsvector('simple', coalesce(full_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(mobile,'') || ' ' || coalesce(registration_number,'')));

commit;
