-- Migration: 064_compliance_register.sql
-- Unified Compliance Document Register: an admin-defined list of required
-- certificates + trainings, targeted by tier/group, plus optional training
-- expiry so completions can lapse and be re-assigned. Additive + reversible.

-- 1) Requirements — what is required, and for whom.
--    kind=certification -> ref_id is an ess_cert_types.id
--    kind=training      -> ref_id is an ess_training_modules.id
--    target_type=tier   -> target_value in ('volunteer','staff','all')
--    target_type=group  -> target_value is an ess_training_groups.id
CREATE TABLE IF NOT EXISTS ess_compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('certification','training')),
  ref_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('tier','group')),
  target_value text NOT NULL,
  created_by uuid REFERENCES ess_app_users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, kind, ref_id, target_type, target_value)
);
CREATE INDEX IF NOT EXISTS idx_compliance_req_company ON ess_compliance_requirements(company_id);

COMMENT ON TABLE ess_compliance_requirements IS 'Admin-defined compliance requirements (certs + trainings) targeted by tier/group.';

ALTER TABLE ess_compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_compliance_requirements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ess_compliance_requirements;
CREATE POLICY tenant_isolation ON ess_compliance_requirements
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());

-- 2) Training expiry: an optional validity on the module, and the resulting
--    per-person expiry stamped when a completion is recorded.
ALTER TABLE ess_training_modules ADD COLUMN IF NOT EXISTS validity_months int;
ALTER TABLE ess_training_progress ADD COLUMN IF NOT EXISTS expires_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_training_progress_expires ON ess_training_progress(company_id, expires_at);
