-- Migration: 027_cert_history.sql
-- Phase: 3 (Compliance & Certification Engine)
-- Description: Append-only history of certification mutations. Parent-scoped:
--   a history row is visible iff its owning certification is visible to the
--   caller (mirrors ess_contract_history in migration 006). RLS via parent.

CREATE TABLE IF NOT EXISTS ess_certification_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  certification_id UUID NOT NULL REFERENCES ess_certifications(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created','renewed','expired','revoked','recertified')),
  action_date TIMESTAMPTZ DEFAULT NOW(),
  performed_by UUID REFERENCES ess_employees(id),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_cert_history_certification ON ess_certification_history(certification_id);

COMMENT ON TABLE ess_certification_history IS 'Append-only certification audit trail; parent-scoped via owning certification.';

-- RLS: parent-scoped — visible iff the parent certification is visible. The
-- parent subquery is itself RLS-filtered, so cross-tenant rows are invisible.
ALTER TABLE ess_certification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_certification_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ess_certification_history;
CREATE POLICY tenant_isolation ON ess_certification_history
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ess_certifications p
    WHERE p.id = certification_id
      AND (p.company_id = public.current_company_id() OR public.is_super_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM ess_certifications p
    WHERE p.id = certification_id
      AND (p.company_id = public.current_company_id() OR public.is_super_admin())
  ));
