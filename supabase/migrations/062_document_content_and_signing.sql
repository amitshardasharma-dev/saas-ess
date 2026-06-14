-- 062_document_content_and_signing.sql (UP)
-- In-portal document content (author policies/agreements in markdown, rendered
-- inline) + capture the signing location on the immutable signed record.
-- Additive + nullable — existing rows + old code unaffected.
-- DOWN: 062_document_content_and_signing.down.sql

alter table ess_documents
  add column if not exists body_markdown text;

alter table ess_signed_documents
  add column if not exists signing_location text;
