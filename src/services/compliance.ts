// Server-side compliance helpers: history writes, reminder scheduling, the
// onboarding bridge, and status caching. Routes stay thin; this centralizes the
// side-effects every certification mutation needs.

import { supabaseAdmin } from '@/lib/supabase-server'
import { enqueueJob } from '@/lib/jobs/dispatch'
import { calcStatus, type CertStatus } from '@/lib/compliance/expiry'
import type { CertHistoryAction } from '@/types/compliance'

/** Append a parent-scoped history row (best-effort; never throws into caller). */
export async function writeCertHistory(input: {
  certificationId: string
  action: CertHistoryAction
  performedBy?: string | null
  notes?: string | null
}): Promise<void> {
  try {
    await supabaseAdmin.from('ess_certification_history').insert({
      certification_id: input.certificationId,
      action: input.action,
      performed_by: input.performedBy ?? null,
      notes: input.notes ?? null,
    })
  } catch (err) {
    console.error('[compliance] failed to write history', err)
  }
}

/**
 * Enqueue reminder jobs for each configured offset whose fire date is still in
 * the future. Offsets are "days before expiry". No-op when the cert never
 * expires or has no offsets. Best-effort: enqueue failures are swallowed.
 */
export async function scheduleReminders(input: {
  companyId: string
  certificationId: string
  expiryDate: string | null
  reminderOffsets: number[]
}): Promise<void> {
  if (!input.expiryDate || !input.reminderOffsets?.length) return
  const expiryMs = Date.parse(input.expiryDate.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(expiryMs)) return

  for (const offset of input.reminderOffsets) {
    if (offset < 0) continue
    const fireAt = new Date(expiryMs - offset * 86400000)
    if (fireAt.getTime() <= Date.now()) continue // already past — skip
    try {
      await enqueueJob(
        'compliance.reminder',
        { certification_id: input.certificationId, offset_days: offset },
        fireAt,
        input.companyId,
      )
    } catch (err) {
      console.error('[compliance] failed to enqueue reminder', err)
    }
  }
}

/**
 * Best-effort bridge to Phase 2 onboarding. `advanceOnboarding(employeeId)` does
 * NOT exist in this worktree — it is provided by Phase 2. We resolve it via a
 * string-indirected dynamic import inside try/catch so this module compiles and
 * runs whether or not Phase 2 is merged. A missing/failing onboarding engine
 * must never break a certification mutation.
 */
export async function maybeAdvanceOnboarding(employeeId: string): Promise<void> {
  try {
    const modulePath = '@/services/onboarding'
    const mod: Record<string, unknown> = await import(/* webpackIgnore: true */ modulePath).catch(
      () => ({}),
    )
    const fn = mod.advanceOnboarding as ((id: string) => unknown) | undefined
    if (typeof fn === 'function') {
      await fn(employeeId)
    }
  } catch {
    // Phase 2 not present or advance failed — intentionally swallow.
  }
}

/** Compute the cached status string for a cert given its expiry date. */
export function computeStatus(expiry: string | null, today?: Date): CertStatus {
  return calcStatus(expiry, today)
}
