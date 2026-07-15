-- 027_acting_for.sql
-- Record which side of a matter the firm actually represents.
--
-- Neither litigation_matters nor conveyancing_matters recorded this: they store
-- both parties (plaintiff/defendant, seller/buyer) but never which one is the
-- client. A practice with multiple staff routinely acts for either side, so this
-- cannot be inferred — the attorney must state it.
--
-- This is what the matter spine needs to set matters.client_name/client_role
-- correctly; without it a backfill would have to guess, and a wrong guess writes
-- the OPPOSING party in as the client.
--
-- Litigation values map onto the existing party columns:
--   'plaintiff' -> plaintiff  (Plaintiff / Applicant)
--   'defendant' -> defendant  (Defendant / Respondent)
-- Conveyancing values:
--   'seller' -> seller_name   (transferring attorney)
--   'buyer'  -> buyer_name    (purchaser's attorney)
--   'bank'   -> bond_bank     (bond / cancellation attorney)
--
-- Nullable with no default: existing rows are genuinely UNKNOWN, and must stay
-- unknown rather than be silently defaulted to one side. The backfill skips and
-- reports them until an attorney sets the value.
--
-- Additive only.

alter table litigation_matters
  add column if not exists acting_for text
    check (acting_for is null or acting_for in ('plaintiff','defendant'));

alter table conveyancing_matters
  add column if not exists acting_for text
    check (acting_for is null or acting_for in ('seller','buyer','bank'));
