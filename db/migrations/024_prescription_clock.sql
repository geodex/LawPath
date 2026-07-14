-- 024_prescription_clock.sql
-- Prescription tracking for litigation matters (Prescription Act 68 of 1969).
--
-- Ordinary debts prescribe in 3 years, judgment debts in 30, certain claims
-- (e.g. against a bank on a cheque) in 6. Prescription runs from the date the
-- debt becomes due (the "cause of action" date) and is interrupted by service
-- of process or a written acknowledgment of debt (s 14/s 15).
--
-- prescription_date is the computed (or manually overridden) date on which the
-- claim prescribes. When the practitioner supplies a cause_of_action_date and a
-- period, the application computes prescription_date = cause + period years.
-- A manual prescription_date always wins. Once the running of prescription is
-- interrupted, prescription_interrupted is set true (with a note recording how)
-- and the matter drops out of the Today prescription warnings.
--
-- Additive only. All columns nullable / defaulted so existing rows are untouched.

alter table litigation_matters
  add column if not exists cause_of_action_date      date,
  add column if not exists prescription_period_years integer not null default 3
    check (prescription_period_years > 0 and prescription_period_years <= 30),
  add column if not exists prescription_date          date,
  add column if not exists prescription_interrupted   boolean not null default false,
  add column if not exists prescription_note          text;

-- Fast lookup for the daily prescription sweep in GET /api/today:
-- active, un-interrupted matters with a computed prescription_date approaching.
create index if not exists lit_matters_prescription_idx
  on litigation_matters (tenant_id, prescription_date)
  where prescription_interrupted = false and prescription_date is not null;
