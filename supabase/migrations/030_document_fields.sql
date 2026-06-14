-- ============================================================================
-- Migration 030: ess_document_fields (Phase 4 — E-Signatures)
-- ----------------------------------------------------------------------------
-- Fillable field definitions attached to a specific document version. A Staff/
-- Admin (hr+) "field designer" defines these; the signer fills them in.
--
-- RLS is co-located in this migration (see _SHARED_CONVENTIONS.md §3/§6). This
-- table carries a DIRECT company_id, so it uses the direct tenant_isolation
-- variant copied from 006_rls_tenant_isolation.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ess_document_fields (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES ess_documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES ess_document_versions(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'date', 'checkbox', 'signature')),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  -- Optional positional metadata (0..1 ratios) for rendering onto the PDF.
  page INTEGER NOT NULL DEFAULT 1,
  x_ratio DOUBLE PRECISION,
  y_ratio DOUBLE PRECISION,
  width_ratio DOUBLE PRECISION,
  height_ratio DOUBLE PRECISION,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (version_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_document_fields_company ON ess_document_fields(company_id);
CREATE INDEX IF NOT EXISTS idx_document_fields_document ON ess_document_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_document_fields_version ON ess_document_fields(version_id);

-- RLS — direct company_id variant (matches 006 tenant_isolation).
ALTER TABLE ess_document_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_document_fields FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ess_document_fields;
CREATE POLICY tenant_isolation ON ess_document_fields
  FOR ALL
  TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());
