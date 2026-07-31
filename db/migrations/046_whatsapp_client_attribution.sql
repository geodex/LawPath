-- 046_whatsapp_client_attribution.sql
-- Attribute an inbound WhatsApp message to the client who sent it, so reading
-- and answering it is billable work on the right file.
--
-- `clients.whatsapp_number` already existed, separate from `mobile`, which is
-- the right shape: a client's WhatsApp is often not the number on the file
-- (a personal phone, a spouse's handset, a work mobile). Without it, matching
-- an inbound message to a client is guesswork.
--
-- MATCHING IS ON THE LAST 9 DIGITS. South African numbers arrive in every
-- shape — "082 123 4567", "+27 82 123 4567", "27821234567" — and WhatsApp
-- delivers the international form. The last 9 digits are the subscriber number
-- and are stable across all of them.
--
-- Attribution is STORED, not recomputed on read: a client may change their
-- number later, and a message must stay attributed to whoever actually sent it.
--
-- Additive only.

alter table whatsapp_messages
  add column if not exists client_id uuid references clients(id) on delete set null,
  add column if not exists matter_id uuid references matters(id) on delete set null;

create index if not exists whatsapp_messages_client_idx
  on whatsapp_messages (client_id, sent_at desc)
  where client_id is not null;

create index if not exists whatsapp_messages_matter_idx
  on whatsapp_messages (matter_id, sent_at desc)
  where matter_id is not null;

-- Drives the daily time-capture sweep over a tenant's correspondence.
create index if not exists whatsapp_messages_tenant_sent_idx
  on whatsapp_messages (tenant_id, sent_at desc);

-- Matching a raw number against a stored one needs the same normalisation on
-- both sides; doing it in one place stops the two drifting apart.
create or replace function lawpath_msisdn_tail(raw text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(raw, ''), '\D', '', 'g'), 9)
$$;

-- Index the normalised form so the lookup on every inbound message does not
-- scan the client list.
create index if not exists clients_whatsapp_tail_idx
  on clients (tenant_id, lawpath_msisdn_tail(whatsapp_number));

create index if not exists clients_mobile_tail_idx
  on clients (tenant_id, lawpath_msisdn_tail(mobile));
