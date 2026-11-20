-- Migration: 072_volunteer_types_onboarding.sql
-- Birch "custom onboarding for each volunteer" request.
--
--   1. Volunteer types (Op shop, Events, ...). A person can have several.
--   2. Each type owns one onboarding template (audience 'type'). A person's
--      checklist = the base flow for their audience (volunteer / staff) plus the
--      flow of each of their types, with duplicate steps shown once.
--   3. Steps get a mandatory flag, an origin ('flow' = from a template,
--      'personal' = added by an admin for one person) and a record of who marked
--      a step "not needed" for one person.
--   4. Onboarding states get an admin approval (approved_at / approved_by).
--
-- Additive only: no existing row is changed except that the new columns take
-- their defaults (every existing step becomes mandatory, origin 'flow').
-- DOWN: 072_volunteer_types_onboarding.down.sql

CREATE TABLE IF NOT EXISTS ess_volunteer_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ess_volunteer_types_company_name
  ON ess_volunteer_types (company_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS ess_employee_volunteer_types (
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  volunteer_type_id UUID NOT NULL REFERENCES ess_volunteer_types(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES ess_app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, volunteer_type_id)
);

CREATE INDEX IF NOT EXISTS idx_ess_employee_volunteer_types_type
  ON ess_employee_volunteer_types (volunteer_type_id);
CREATE INDEX IF NOT EXISTS idx_ess_employee_volunteer_types_company
  ON ess_employee_volunteer_types (company_id);

-- A volunteer type owns exactly one template.
ALTER TABLE ess_onboarding_templates
  ADD COLUMN IF NOT EXISTS volunteer_type_id UUID REFERENCES ess_volunteer_types(id) ON DELETE CASCADE;
ALTER TABLE ess_onboarding_templates DROP CONSTRAINT IF EXISTS ess_onboarding_templates_audience_check;
ALTER TABLE ess_onboarding_templates
  ADD CONSTRAINT ess_onboarding_templates_audience_check CHECK (audience IN ('volunteer', 'staff', 'type'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_ess_onboarding_templates_volunteer_type
  ON ess_onboarding_templates (volunteer_type_id) WHERE volunteer_type_id IS NOT NULL;

-- Steps: mandatory flag, origin, and the "not needed for this person" record.
ALTER TABLE ess_onboarding_steps ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ess_onboarding_steps ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'flow';
ALTER TABLE ess_onboarding_steps DROP CONSTRAINT IF EXISTS ess_onboarding_steps_origin_chk;
ALTER TABLE ess_onboarding_steps
  ADD CONSTRAINT ess_onboarding_steps_origin_chk CHECK (origin IN ('flow', 'personal'));
ALTER TABLE ess_onboarding_steps ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES ess_app_users(id) ON DELETE SET NULL;
ALTER TABLE ess_onboarding_steps ADD COLUMN IF NOT EXISTS waived_by UUID REFERENCES ess_app_users(id) ON DELETE SET NULL;
ALTER TABLE ess_onboarding_steps ADD COLUMN IF NOT EXISTS waived_at TIMESTAMPTZ;
ALTER TABLE ess_onboarding_steps ADD COLUMN IF NOT EXISTS waive_reason TEXT;

-- Approval.
ALTER TABLE ess_onboarding_states ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE ess_onboarding_states ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES ess_app_users(id) ON DELETE SET NULL;

-- RLS: the app uses the service role (bypasses RLS) and scopes by company_id in
-- code. Policies below only allow same-tenant reads for authenticated clients.
ALTER TABLE ess_volunteer_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS volunteer_types_select ON ess_volunteer_types;
CREATE POLICY volunteer_types_select ON ess_volunteer_types
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

ALTER TABLE ess_employee_volunteer_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_volunteer_types_select ON ess_employee_volunteer_types;
CREATE POLICY employee_volunteer_types_select ON ess_employee_volunteer_types
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());

COMMENT ON TABLE ess_volunteer_types IS
  'Volunteer types (e.g. Op shop, Events). Each type owns one onboarding template (audience=type).';
COMMENT ON TABLE ess_employee_volunteer_types IS
  'Which volunteer types each person has. A person can have several.';
COMMENT ON COLUMN ess_onboarding_steps.origin IS
  'flow = copied from a template (base or volunteer type); personal = added by an admin for one person';
COMMENT ON COLUMN ess_onboarding_steps.is_required IS
  'Mandatory steps must be done (or marked not needed) before an admin can approve the person';
