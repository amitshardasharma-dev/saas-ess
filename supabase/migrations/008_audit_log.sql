-- Migration: 008_audit_log.sql
-- Phase: 0
-- Description: Append-only audit log for platform-admin actions, email sends, and
--   any sensitive mutation. Written via src/lib/audit.ts recordAudit().

CREATE TABLE IF NOT EXISTS ess_audit_log (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	company_id uuid REFERENCES ess_companies(id),
	actor_id uuid,
	action text NOT NULL,
	entity text,
	entity_id text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ess_audit_log_company_id ON ess_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_ess_audit_log_actor_id ON ess_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_ess_audit_log_entity ON ess_audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_ess_audit_log_created_at ON ess_audit_log(created_at DESC);

-- RLS in the same migration (conventions §6.3 / §3d).
-- company_id is nullable for platform-level events (no tenant); those rows are
-- only ever read by the service role, which bypasses RLS.
ALTER TABLE ess_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_audit_log ON ess_audit_log;
CREATE POLICY tenant_isolation_audit_log ON ess_audit_log
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);
