-- Down migration for 063_cert_verification.sql
DROP TABLE IF EXISTS ess_certification_messages;
DROP INDEX IF EXISTS idx_certifications_verification;
ALTER TABLE ess_certifications
  DROP COLUMN IF EXISTS verification_status,
  DROP COLUMN IF EXISTS verified_by,
  DROP COLUMN IF EXISTS verified_at;
