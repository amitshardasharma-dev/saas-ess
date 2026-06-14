-- Migration: 026_certifications.sql
-- Phase: 3 (Compliance & Certification Engine)
-- Description: Per-employee certification register. `status` is a cached
--   valid|expiring|expired|pending value recomputed on write and by the
--   compliance.refresh-status job. RLS ships in this same migration.

CREATE TABLE IF NOT EXISTS ess_certifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  cert_type_id UUID REFERENCES ess_cert_types(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring','expired','pending')),
  completion_date DATE,
  -- NULL expiry = never expires (cert type with NULL validity_months).
  expiry_date DATE,
  file_url TEXT,
  file_name TEXT,
  notes TEXT,
  created_by UUID REFERENCES ess_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certifications_company ON ess_certifications(company_id);
CREATE INDEX IF NOT EXISTS idx_certifications_employee ON ess_certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_certifications_expiry ON ess_certifications(expiry_date);
CREATE INDEX IF NOT EXISTS idx_certifications_status ON ess_certifications(status);

COMMENT ON TABLE ess_certifications IS 'Per-employee certifications; expiry_date drives status (valid/expiring/expired).';

-- RLS: direct-company_id tenant isolation (copy of the 006 pattern).
ALTER TABLE ess_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_certifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ess_certifications;
CREATE POLICY tenant_isolation ON ess_certifications
  FOR ALL
  TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());
