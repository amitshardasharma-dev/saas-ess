-- Migration: 070_signing_sequence.sql
-- MOS-720 — multiple signatories with an admin-defined signing order.
--
-- Additive only. A version with no signing_config (every existing document)
-- keeps the original single-signer flow unchanged.
--
--  * ess_document_fields.signer_role     which signer fills each field
--                                        ('recipient' = the person the document is for)
--  * ess_document_versions.signing_config { roles: [...] } in signing order
--  * ess_signing_requests                one per recipient copy (recipient NULL =
--                                        the shared sheet for "sign once" roles);
--                                        roles_snapshot freezes the order at start
--  * ess_signing_request_signatures      one immutable row per completed step
--
-- The finished copy is still written to ess_signed_documents (employee_id = the
-- recipient), so onboarding, reports and downloads keep working unchanged.
-- DOWN: 070_signing_sequence.down.sql

ALTER TABLE ess_document_fields
  ADD COLUMN IF NOT EXISTS signer_role TEXT NOT NULL DEFAULT 'recipient';

ALTER TABLE ess_document_versions
  ADD COLUMN IF NOT EXISTS signing_config JSONB;

CREATE TABLE IF NOT EXISTS ess_signing_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES ess_documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES ess_document_versions(id) ON DELETE CASCADE,
  recipient_employee_id UUID REFERENCES ess_employees(id) ON DELETE CASCADE,
  roles_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  signed_document_id UUID REFERENCES ess_signed_documents(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancel_reason TEXT
);

-- At most one live (non-cancelled) request per recipient copy / shared sheet.
CREATE UNIQUE INDEX IF NOT EXISTS uq_signing_requests_live
  ON ess_signing_requests (version_id, COALESCE(recipient_employee_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_signing_requests_company_status ON ess_signing_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_signing_requests_document ON ess_signing_requests(document_id);

CREATE TABLE IF NOT EXISTS ess_signing_request_signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES ess_signing_requests(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  signer_employee_id UUID REFERENCES ess_employees(id),
  signer_name TEXT NOT NULL,
  signature_type TEXT NOT NULL CHECK (signature_type IN ('typed', 'drawn')),
  signature_data TEXT,
  field_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  signing_location TEXT,
  ip_address TEXT,
  user_agent TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, role_key)
);
CREATE INDEX IF NOT EXISTS idx_signing_signatures_request ON ess_signing_request_signatures(request_id);

-- RLS (service role bypasses; defensive parity with 031).
ALTER TABLE ess_signing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_signing_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ess_signing_requests;
CREATE POLICY tenant_isolation ON ess_signing_requests
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());

-- Signatures are evidence: SELECT + INSERT only, no UPDATE/DELETE.
ALTER TABLE ess_signing_request_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_signing_request_signatures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signing_signatures_select ON ess_signing_request_signatures;
CREATE POLICY signing_signatures_select ON ess_signing_request_signatures
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
DROP POLICY IF EXISTS signing_signatures_insert ON ess_signing_request_signatures;
CREATE POLICY signing_signatures_insert ON ess_signing_request_signatures
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());
