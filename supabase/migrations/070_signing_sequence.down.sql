DROP TABLE IF EXISTS ess_signing_request_signatures;
DROP TABLE IF EXISTS ess_signing_requests;
ALTER TABLE ess_document_versions DROP COLUMN IF EXISTS signing_config;
ALTER TABLE ess_document_fields DROP COLUMN IF EXISTS signer_role;
