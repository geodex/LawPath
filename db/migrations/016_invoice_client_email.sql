-- 016_invoice_client_email.sql
-- Add client_email to invoices so staff can store and auto-fill the recipient
-- address when emailing an invoice as a PDF attachment.

alter table invoices
  add column if not exists client_email text;
