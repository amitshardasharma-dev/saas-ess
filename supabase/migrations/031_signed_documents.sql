-- ============================================================================
-- Migration 031: ess_signed_documents (Phase 4 — E-Signatures)
-- ----------------------------------------------------------------------------
-- The immutable signed artifact produced when a signer completes a document.
--
-- IMMUTABILITY GUARANTEE (spec §4, §8): this table is APPEND-ONLY. RLS grants
-- SELECT (same company) and INSERT (same company) only. There is deliberately
-- NO UPDATE and NO DELETE policy, so once a signed document is written it cannot
-- be mutated by any authenticated/anon client. A re-sign creates a NEW row; the
-- prior row is preserved. (Service-role/supabaseAdmin bypasses RLS, so the app
-- layer must never expose an update/delete path — and it does not.)
--
-- Phase 2 (onboarding profile widget) and Phase 7 (reporting) READ this table by
-- contract via GET /api/signed-documents. Do not rename columns.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ess_signed_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES ess_documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES ess_document_versions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signature_type TEXT NOT NULL CHECK (signature_type IN ('typed', 'drawn')),
  signature_data TEXT,
  field_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed_pdf_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signed_documents_company ON ess_signed_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_signed_documents_employee ON ess_signed_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_signed_documents_document ON ess_signed_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_signed_documents_version ON ess_signed_documents(version_id);

-- RLS — IMMUTABLE: SELECT + INSERT only, NO UPDATE/DELETE policy on purpose.
ALTER TABLE ess_signed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_signed_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signed_documents_select ON ess_signed_documents;
CREATE POLICY signed_documents_select ON ess_signed_documents
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
DROP POLICY IF EXISTS signed_documents_insert ON ess_signed_documents;
CREATE POLICY signed_documents_insert ON ess_signed_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.current_company_id());
