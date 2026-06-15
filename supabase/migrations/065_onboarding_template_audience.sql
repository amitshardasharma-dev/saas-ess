-- Migration: 065_onboarding_template_audience.sql
-- Onboarding flows per audience: a tenant has a Volunteer flow and a Staff flow,
-- each an editable onboarding template. Adds an `audience` to templates so
-- initOnboarding can pick the right one by the new person's role. Additive +
-- reversible. Existing templates are treated as the Volunteer flow.
ALTER TABLE ess_onboarding_templates
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'volunteer'
    CHECK (audience IN ('volunteer', 'staff'));

UPDATE ess_onboarding_templates SET audience = 'volunteer' WHERE audience IS NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_templates_audience
  ON ess_onboarding_templates(company_id, audience);
