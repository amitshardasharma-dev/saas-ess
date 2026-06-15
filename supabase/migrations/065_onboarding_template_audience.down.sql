-- Down migration for 065_onboarding_template_audience.sql
DROP INDEX IF EXISTS idx_onboarding_templates_audience;
ALTER TABLE ess_onboarding_templates DROP COLUMN IF EXISTS audience;
