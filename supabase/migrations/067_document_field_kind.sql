-- Migration: 067_document_field_kind.sql
-- Adds a semantic "kind" to placed document fields so the signing UI can
-- auto-fill known fields from the signer's profile (full name, email, member no,
-- date of birth, id number) and the designer can offer a friendly field palette.
-- `type` stays the INPUT type the embedder uses (text/date/checkbox/signature);
-- `kind` is an orthogonal hint (default 'custom' = no auto-fill).
alter table public.ess_document_fields
  add column if not exists kind text not null default 'custom';

comment on column public.ess_document_fields.kind is
  'Semantic hint for labeling + profile auto-fill: custom | full_name | first_name | last_name | email | employee_no | dob | id_number';
