-- 025_dots_polling.sql
-- DOTS (Deeds Office Tracking System) auto-polling for conveyancing matters.
--
-- SearchWorks exposes a dots-barcode lookup that returns the live Deeds Office
-- status for a lodged matter. This migration lets each conveyancing matter carry
-- its lodgement barcode + deeds office so a daily job can poll for movement and
-- surface it automatically, drafting (never sending) a client update for the
-- attorney to approve.
--
--   dots_barcode           the lodgement barcode captured at lodgement
--   dots_deeds_office      SearchWorks deeds-office code the barcode belongs to
--   dots_last_status       last status string returned by SearchWorks
--   dots_last_polled_at    when the poller last ran against this matter
--   dots_status_changed_at set when dots_last_status actually changed
--   dots_draft_message     attorney-review draft client update for the change
--   dots_ack_at            when the attorney acknowledged the last change
--                          (dots_status_changed_at > dots_ack_at => unseen)
--
-- Additive only. Every column nullable so existing rows are untouched.

alter table conveyancing_matters
  add column if not exists dots_barcode           text,
  add column if not exists dots_deeds_office      text,
  add column if not exists dots_last_status       text,
  add column if not exists dots_last_polled_at    timestamptz,
  add column if not exists dots_status_changed_at timestamptz,
  add column if not exists dots_draft_message     text,
  add column if not exists dots_ack_at            timestamptz;

-- The daily sweep only touches matters that actually carry a barcode.
create index if not exists conv_matters_dots_idx
  on conveyancing_matters (dots_last_polled_at)
  where dots_barcode is not null and dots_barcode <> '';
