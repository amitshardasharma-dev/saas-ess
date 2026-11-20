-- DOWN for 072_volunteer_types_onboarding.sql

ALTER TABLE ess_onboarding_states DROP COLUMN IF EXISTS approved_by;
ALTER TABLE ess_onboarding_states DROP COLUMN IF EXISTS approved_at;

ALTER TABLE ess_onboarding_steps DROP COLUMN IF EXISTS waive_reason;
ALTER TABLE ess_onboarding_steps DROP COLUMN IF EXISTS waived_at;
ALTER TABLE ess_onboarding_steps DROP COLUMN IF EXISTS waived_by;
ALTER TABLE ess_onboarding_steps DROP COLUMN IF EXISTS added_by;
ALTER TABLE ess_onboarding_steps DROP CONSTRAINT IF EXISTS ess_onboarding_steps_origin_chk;
ALTER TABLE ess_onboarding_steps DROP COLUMN IF EXISTS origin;
ALTER TABLE ess_onboarding_steps DROP COLUMN IF EXISTS is_required;

-- Type templates (and their steps, by cascade) go before the check is narrowed.
DELETE FROM ess_onboarding_templates WHERE audience = 'type';
DROP INDEX IF EXISTS uq_ess_onboarding_templates_volunteer_type;
ALTER TABLE ess_onboarding_templates DROP CONSTRAINT IF EXISTS ess_onboarding_templates_audience_check;
ALTER TABLE ess_onboarding_templates
  ADD CONSTRAINT ess_onboarding_templates_audience_check CHECK (audience IN ('volunteer', 'staff'));
ALTER TABLE ess_onboarding_templates DROP COLUMN IF EXISTS volunteer_type_id;

DROP TABLE IF EXISTS ess_employee_volunteer_types;
DROP TABLE IF EXISTS ess_volunteer_types;
