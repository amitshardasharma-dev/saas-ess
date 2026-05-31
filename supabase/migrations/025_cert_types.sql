-- Migration: 025_cert_types.sql
-- Phase: 3 (Compliance & Certification Engine)
-- Description: Tenant-configurable certification types (e.g. Police Check, First
--   Aid/CPR). validity_months drives expiry math; reminder_offsets drive Phase 7
--   reminder scheduling. RLS ships in this same migration (conventions §3/§6).

CREATE TABLE IF NOT EXISTS ess_cert_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- NULL validity = never expires.
  validity_months INTEGER,
  requires_file BOOLEAN NOT NULL DEFAULT FALSE,
  -- Required for onboarding completion (drives the advanceOnboarding hook).
  required BOOLEAN NOT NULL DEFAULT FALSE,
  -- Days-before-expiry at which reminders fire (Phase 7 reads this).
  reminder_offsets INTEGER[] NOT NULL DEFAULT '{90,30,7}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cert_types_company ON ess_cert_types(company_id);

COMMENT ON TABLE ess_cert_types IS 'Tenant-defined certification types; validity_months drives expiry, reminder_offsets drive Phase 7 reminders.';

-- RLS: direct-company_id tenant isolation (copy of the 006 pattern).
ALTER TABLE ess_cert_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_cert_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ess_cert_types;
CREATE POLICY tenant_isolation ON ess_cert_types
  FOR ALL
  TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());
