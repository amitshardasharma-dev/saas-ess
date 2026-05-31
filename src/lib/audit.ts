// src/lib/audit.ts
//
// ---------------------------------------------------------------------------
// PHASE 1 STUB — DELETE BEFORE MERGE
// Phase 0 owns the real `recordAudit` + `ess_audit_log` contract. This minimal
// stub lets Phase 1 platform-config writes call recordAudit at runtime before
// Phase 0 lands. It is best-effort and never throws. When Phase 0's helper
// merges, delete this file and re-point imports to '@/lib/audit' from Phase 0.
// Listed in MERGE_NOTES.md.
// ---------------------------------------------------------------------------

import { supabaseAdmin } from '@/lib/supabase-server'

export interface AuditEntry {
  companyId: string
  actorId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Best-effort audit write. Never throws — auditing must not break the mutation
 * it records. Matches the expected ess_audit_log columns (Phase 0 contract).
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from('ess_audit_log').insert({
      company_id: entry.companyId,
      actor_id: entry.actorId ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    })
  } catch {
    // Swallow — see contract note above. (ess_audit_log may not exist yet.)
  }
}
