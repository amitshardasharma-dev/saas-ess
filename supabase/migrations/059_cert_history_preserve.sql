-- Migration: 059_cert_history_preserve.sql
-- Phase: 3 (Compliance & Certification Engine)
-- Spec feature #9 — legally-important certification audit history.
--
-- Problem: migration 027 defined
--   certification_id UUID NOT NULL REFERENCES ess_certifications(id) ON DELETE CASCADE
-- on ess_certification_history. The DELETE handler in
-- src/app/api/certifications/[id]/route.ts writes a 'revoked' history row and
-- THEN hard-deletes the certification — the ON DELETE CASCADE then immediately
-- wipes that just-written row, destroying the dedicated audit chain. (The global
-- ess_audit_log 'certification.deleted' row survives, but the per-cert
-- ess_certification_history trail does not.)
--
-- Fix (client-approved): drop the CASCADING foreign key so history rows SURVIVE a
-- cert delete, while KEEPING certification_id (NOT NULL + its index) intact for
-- audit linkage. After a cert is deleted its history rows remain with their
-- original certification_id — a deliberately dangling-but-auditable reference.
--
-- RLS note: the tenant_isolation policy on ess_certification_history is
-- parent-scoped (it joins back to ess_certifications by certification_id). Once a
-- cert is deleted the parent row is gone, so surviving history rows are no longer
-- visible to tenant API callers — they are retained for service-role / audit
-- access only. That is the intended behaviour for a destroyed-cert audit trail.

ALTER TABLE ess_certification_history
  DROP CONSTRAINT IF EXISTS ess_certification_history_certification_id_fkey;

-- certification_id stays NOT NULL and idx_cert_history_certification (from 027)
-- is untouched, so the value is preserved and remains queryable as an audit key.

COMMENT ON COLUMN ess_certification_history.certification_id IS
  'Owning certification id. No FK by design (migration 059): history must survive '
  'a cert delete for legal audit (spec #9), so this may reference an already-'
  'deleted certification. Retained NOT NULL + indexed as the audit linkage key.';
