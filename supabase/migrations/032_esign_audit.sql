-- ============================================================================
-- Migration 032: ess_esign_events (Phase 4 — E-Signatures)
-- ----------------------------------------------------------------------------
-- Append-only e-sign audit trail, separate from the global ess_audit_log. Each
-- row records an event in the signing lifecycle (field_defined, signing_started,
-- signed, downloaded) with actor + IP + meta.
--
-- This is a CHILD table scoped through its parent ess_signed_documents (spec §4:
-- "RLS via parent"). signed_document_id may be NULL for pre-signature events
-- (e.g. field_defined / signing_started); for those a direct company_id check is
-- used. Append-only: SELECT + INSERT policies only, NO UPDATE/DELETE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ess_esign_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  signed_document_id UUID REFERENCES ess_signed_documents(id) ON DELETE SET NULL,
  document_id UUID REFERENCES ess_documents(id) ON DELETE CASCADE,
  version_id UUID REFERENCES ess_document_versions(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('field_defined', 'signing_started', 'signed', 'downloaded')),
  actor UUID,
  ip TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esign_events_company ON ess_esign_events(company_id);
CREATE INDEX IF NOT EXISTS idx_esign_events_signed_doc ON ess_esign_events(signed_document_id);
CREATE INDEX IF NOT EXISTS idx_esign_events_document ON ess_esign_events(document_id);

-- RLS — append-only. Direct company_id check (also covers parent scope since the
-- parent signed-doc shares the same company_id). SELECT + INSERT only.
ALTER TABLE ess_esign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_esign_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS esign_events_select ON ess_esign_events;
CREATE POLICY esign_events_select ON ess_esign_events
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
DROP POLICY IF EXISTS esign_events_insert ON ess_esign_events;
CREATE POLICY esign_events_insert ON ess_esign_events
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.current_company_id());
