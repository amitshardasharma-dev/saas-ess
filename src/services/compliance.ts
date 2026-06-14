// Server-side compliance helpers: history writes, reminder scheduling, the
// onboarding bridge, and status caching. Routes stay thin; this centralizes the
// side-effects every certification mutation needs.

import { supabaseAdmin } from '@/lib/supabase-admin'
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
 * No-op, retained for call-site compatibility.
 *
 * This used to enqueue per-cert `compliance.reminder` jobs at each offset's fire
 * date — but no handler was ever registered for that type, so those jobs only
 * dead-lettered (markJobFailed) and never sent anything.
 *
 * Reminder delivery is now handled by the daily `reminders.scan` job (enqueued for
 * every active tenant by /api/cron/daily-scans, drained by /api/cron/run-jobs).
 * `scanReminders` sweeps all active `ess_reminder_configs` and matches every cert
 * whose `daysUntil(expiry)` equals a configured offset, deduping via
 * `ess_reminder_sends` — which fully supersedes this per-cert path. We keep the
 * exported signature so existing callers still compile; the body intentionally
 * does nothing.
 */
export async function scheduleReminders(input: {
  companyId: string
  certificationId: string
  expiryDate: string | null
  reminderOffsets: number[]
}): Promise<void> {
  // Superseded by the daily reminders.scan automation — intentionally a no-op.
  // `input` is referenced only to satisfy the no-unused-vars lint rule while the
  // signature is preserved for existing callers.
  void input
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
