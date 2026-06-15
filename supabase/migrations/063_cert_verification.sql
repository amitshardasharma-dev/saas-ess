-- Migration: 063_cert_verification.sql
-- Phase: 3 (Compliance) — certificate review/validation workflow.
-- Adds an admin/HR verification lifecycle to certifications plus a per-cert
-- message thread for the volunteer<->reviewer back-and-forth. Additive +
-- reversible (see .down.sql). Existing certs are grandfathered to 'validated'.

-- 1) Verification lifecycle on the certification itself.
ALTER TABLE ess_certifications
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','submitted','validated','rejected','changes_requested')),
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES ess_app_users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Grandfather pre-existing certs (added before the workflow) as already validated
-- so they don't flood the new review queue. Runs once; only affects current rows.
UPDATE ess_certifications SET verification_status = 'validated'
  WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_certifications_verification
  ON ess_certifications(company_id, verification_status);

-- 2) Per-certification message thread (volunteer <-> reviewer back-and-forth).
CREATE TABLE IF NOT EXISTS ess_certification_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  certification_id UUID NOT NULL REFERENCES ess_certifications(id) ON DELETE CASCADE,
  author_app_user_id UUID REFERENCES ess_app_users(id),
  -- owner = the volunteer/cert holder; reviewer = hr+/admin; system = automated.
  author_kind TEXT NOT NULL CHECK (author_kind IN ('owner','reviewer','system')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cert_messages_cert ON ess_certification_messages(certification_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cert_messages_company ON ess_certification_messages(company_id);

COMMENT ON TABLE ess_certification_messages IS 'Per-certification review thread; parent-scoped via owning certification.';

-- RLS: direct company_id isolation (service-role bypasses; defensive parity with 026).
ALTER TABLE ess_certification_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_certification_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ess_certification_messages;
CREATE POLICY tenant_isolation ON ess_certification_messages
  FOR ALL
  TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());
