-- Down migration for 064_compliance_register.sql
DROP TABLE IF EXISTS ess_compliance_requirements;
DROP INDEX IF EXISTS idx_training_progress_expires;
ALTER TABLE ess_training_progress DROP COLUMN IF EXISTS expires_at;
ALTER TABLE ess_training_modules DROP COLUMN IF EXISTS validity_months;
