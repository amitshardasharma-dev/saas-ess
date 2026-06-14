-- 062_document_content_and_signing.down.sql (DOWN — reverses 062 up)
alter table ess_signed_documents drop column if exists signing_location;
alter table ess_documents drop column if exists body_markdown;
