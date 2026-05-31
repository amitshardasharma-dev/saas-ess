-- 016_tenant_terminology.sql
-- Phase 1: per-tenant terminology overrides for user-facing entity nouns.
-- A row overrides the platform default (src/lib/labels/defaults.ts) for one
-- tenant + term. Resolved server-side by getLabels() and client-side by
-- useLabels(); also consumed by Phase 3/7 exporters and email rendering.

CREATE TABLE IF NOT EXISTS ess_tenant_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  term_key TEXT NOT NULL,
  singular TEXT NOT NULL,
  plural TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, term_key)
);

CREATE INDEX IF NOT EXISTS idx_ess_tenant_labels_company
  ON ess_tenant_labels (company_id);

-- RLS — tenant isolation, copying the project pattern (Phase 0 migration 006
-- owns the current_company_id() / is_super_admin() helpers; this migration
-- depends on them by contract per _SHARED_CONVENTIONS §6.3).
ALTER TABLE ess_tenant_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_tenant_labels FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON ess_tenant_labels;
CREATE POLICY tenant_isolation ON ess_tenant_labels
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_super_admin());
