-- Migration: 069_certificate_templates.sql
-- MOS-721 — per-tenant certificate template (logo, wording, colours, signatory).
--
-- APPEND-ONLY + VERSIONED: every save inserts a new version; rows are never
-- updated. A completion certificate is rendered with the version that was in
-- effect when the learner completed the module (latest created_at <= completed_at),
-- so editing the template later never changes a certificate already issued.
-- A tenant with no rows keeps the built-in default layout (no behaviour change).
-- DOWN: 069_certificate_templates.down.sql

CREATE TABLE IF NOT EXISTS ess_certificate_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES ess_app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, version)
);

CREATE INDEX IF NOT EXISTS idx_certificate_templates_company_created
  ON ess_certificate_templates(company_id, created_at DESC);

-- RLS: SELECT + INSERT only (append-only). Service role bypasses; the app
-- never exposes an update/delete path.
ALTER TABLE ess_certificate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_certificate_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS certificate_templates_select ON ess_certificate_templates;
CREATE POLICY certificate_templates_select ON ess_certificate_templates
  FOR SELECT
  TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin());
DROP POLICY IF EXISTS certificate_templates_insert ON ess_certificate_templates;
CREATE POLICY certificate_templates_insert ON ess_certificate_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());

COMMENT ON TABLE ess_certificate_templates IS
  'MOS-721: versioned, append-only per-tenant completion-certificate templates';
