// src/lib/training/tracking.ts
//
// Automated tracking core: events, per-item progress upserts, time accrual, and
// module % recompute. All writes are tenant-scoped via the module/item company_id.
//
// PUBLISHED CONTRACTS (re-exported from @/lib/training):
//   recomputeModuleProgress(employeeId, moduleId)
//   recordQuizResult(employeeId, itemId, passed, score)   <-- Phase 6 calls this;
//                                                             signature is FROZEN.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'
import type {
  TrainingEventName,
  TrainingItem,
  TrainingItemProgress,
  TrainingProgressStatus,
} from '@/types/training'
import { completedItemIds, computePercentComplete, statusForPercent } from './progress'
import { tryAdvanceOnboarding, tryRecertHook } from './onboarding'
import { calcExpiry } from '@/lib/compliance/expiry'

/** Server-side cap on a single time_tick (seconds). Prevents abuse/runaway. */
export const MAX_TICK_SECONDS = 120
/** Hard ceiling for accumulated per-item time (24h) to bound bad clients. */
export const MAX_ITEM_TIME_SECONDS = 86_400

/** Load an item with its tenant id; null if missing. */
async function loadItem(itemId: string): Promise<TrainingItem | null> {
  const { data } = await supabaseAdmin
    .from('ess_training_items')
    .select('*')
    .eq('id', itemId)
    .single()
  return (data as TrainingItem) ?? null
}

/** Append an append-only event row (best-effort scoping by company). */
export async function recordTrainingEvent(params: {
  companyId: string
  employeeId: string
  moduleId: string
  itemId?: string | null
  event: TrainingEventName
  meta?: Record<string, unknown>
}): Promise<void> {
  const { error } = await supabaseAdmin.from('ess_training_events').insert({
    company_id: params.companyId,
    employee_id: params.employeeId,
    module_id: params.moduleId,
    item_id: params.itemId ?? null,
    event: params.event,
    meta: params.meta ?? {},
  })
  if (error) console.error('[training] event insert failed:', error.message)
}

/**
 * Upsert a per-item progress row, merging the given patch. Keyed on the unique
 * (employee_id, item_id) index. Returns the resulting row.
 */
async function upsertItemProgress(
  companyId: string,
  employeeId: string,
  itemId: string,
  patch: Partial<TrainingItemProgress>
): Promise<TrainingItemProgress | null> {
  const { data: existing } = await supabaseAdmin
    .from('ess_training_item_progress')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('item_id', itemId)
    .maybeSingle()

  const nowIso = new Date().toISOString()
  const base = (existing as TrainingItemProgress | null) ?? null

  const row = {
    company_id: companyId,
    employee_id: employeeId,
    item_id: itemId,
    status: patch.status ?? base?.status ?? 'not_started',
    acknowledged: patch.acknowledged ?? base?.acknowledged ?? false,
    time_spent_seconds: patch.time_spent_seconds ?? base?.time_spent_seconds ?? 0,
    last_event_at: patch.last_event_at ?? nowIso,
    completed_at: patch.completed_at ?? base?.completed_at ?? null,
  }

  const { data, error } = await supabaseAdmin
    .from('ess_training_item_progress')
    .upsert(row, { onConflict: 'employee_id,item_id' })
    .select()
    .single()

  if (error) {
    console.error('[training] item progress upsert failed:', error.message)
    return base
  }
  return data as TrainingItemProgress
}

/** Mark an item complete (idempotent) and recompute the parent module. */
export async function markItemComplete(
  employeeId: string,
  item: TrainingItem,
  event: TrainingEventName,
  meta?: Record<string, unknown>
): Promise<void> {
  const nowIso = new Date().toISOString()
  await upsertItemProgress(item.company_id, employeeId, item.id, {
    status: 'complete',
    acknowledged: true,
    completed_at: nowIso,
    last_event_at: nowIso,
  })
  await recordTrainingEvent({
    companyId: item.company_id,
    employeeId,
    moduleId: item.module_id,
    itemId: item.id,
    event,
    meta,
  })
  await recomputeModuleProgress(employeeId, item.module_id)
}

/**
 * Record a tracking event from the client for an item:
 *   - 'video_watched'    -> item complete
 *   - 'doc_downloaded'   -> in_progress (logged; not completion on its own)
 *   - 'doc_acknowledged' -> item complete
 *   - 'time_tick'        -> accrue capped time (does not complete an item)
 */
export async function recordItemEvent(
  employeeId: string,
  itemId: string,
  event: 'video_watched' | 'doc_downloaded' | 'doc_acknowledged' | 'time_tick',
  seconds?: number
): Promise<TrainingItemProgress | null> {
  const item = await loadItem(itemId)
  if (!item) return null

  if (event === 'time_tick') {
    return accrueTime(employeeId, item, seconds ?? 0)
  }

  if (event === 'doc_downloaded') {
    const updated = await upsertItemProgress(item.company_id, employeeId, item.id, {
      status: 'in_progress',
      last_event_at: new Date().toISOString(),
    })
    await recordTrainingEvent({
      companyId: item.company_id,
      employeeId,
      moduleId: item.module_id,
      itemId: item.id,
      event: 'doc_downloaded',
    })
    return updated
  }

  // video_watched / doc_acknowledged -> completion
  await markItemComplete(employeeId, item, event)
  const { data } = await supabaseAdmin
    .from('ess_training_item_progress')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('item_id', item.id)
    .maybeSingle()
  return (data as TrainingItemProgress) ?? null
}

/**
 * Accrue active-view time for an item. The per-tick delta is capped at
 * MAX_TICK_SECONDS server-side and the running total is clamped to
 * MAX_ITEM_TIME_SECONDS. Writes a 'time_tick' event with the applied delta.
 */
export async function accrueTime(
  employeeId: string,
  item: TrainingItem,
  seconds: number
): Promise<TrainingItemProgress | null> {
  const delta = Math.max(0, Math.min(Math.floor(seconds || 0), MAX_TICK_SECONDS))
  if (delta === 0) return null

  const { data: existing } = await supabaseAdmin
    .from('ess_training_item_progress')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('item_id', item.id)
    .maybeSingle()

  const base = (existing as TrainingItemProgress | null) ?? null
  const current = base?.time_spent_seconds ?? 0
  const nextTotal = Math.min(current + delta, MAX_ITEM_TIME_SECONDS)

  // An item that was not_started becomes in_progress once time is logged.
  const nextStatus: TrainingProgressStatus =
    base?.status === 'complete' ? 'complete' : base?.status === 'in_progress' ? 'in_progress' : 'in_progress'

  const updated = await upsertItemProgress(item.company_id, employeeId, item.id, {
    time_spent_seconds: nextTotal,
    status: nextStatus,
    last_event_at: new Date().toISOString(),
  })

  await recordTrainingEvent({
    companyId: item.company_id,
    employeeId,
    moduleId: item.module_id,
    itemId: item.id,
    event: 'time_tick',
    meta: { seconds: delta, total: nextTotal },
  })

  return updated
}

/**
 * PUBLISHED (Phase 6 calls this — DO NOT change the signature).
 *
 * Consume a quiz attempt result for a training quiz item. On pass the item is
 * marked complete and the module is recomputed; on fail a 'quiz_failed' event
 * is recorded. Looks the item up by id to obtain its tenant + module.
 */
export async function recordQuizResult(
  employeeId: string,
  itemId: string,
  passed: boolean,
  score?: number
): Promise<void> {
  const item = await loadItem(itemId)
  if (!item) {
    console.warn('[training] recordQuizResult: unknown item', itemId)
    return
  }

  if (passed) {
    await markItemComplete(employeeId, item, 'quiz_passed', { score })
  } else {
    // Track the attempt without completing the item.
    await upsertItemProgress(item.company_id, employeeId, item.id, {
      status: 'in_progress',
      last_event_at: new Date().toISOString(),
    })
    await recordTrainingEvent({
      companyId: item.company_id,
      employeeId,
      moduleId: item.module_id,
      itemId: item.id,
      event: 'quiz_failed',
      meta: { score },
    })
  }
}

/**
 * PUBLISHED. Recompute a module's percent_complete + status for an employee
 * from required-item completion. On reaching 100% the module is marked complete
 * (with completed_at + a 'module_completed' event) and the guarded cross-phase
 * onboarding/recert hooks fire. Returns the new percent.
 */
export async function recomputeModuleProgress(
  employeeId: string,
  moduleId: string
): Promise<number> {
  const { data: mod } = await supabaseAdmin
    .from('ess_training_modules')
    .select('id, company_id, validity_months')
    .eq('id', moduleId)
    .single()
  if (!mod) return 0
  const companyId = mod.company_id as string
  const validityMonths = (mod as { validity_months?: number | null }).validity_months ?? null

  const { data: itemRows } = await supabaseAdmin
    .from('ess_training_items')
    .select('id, required')
    .eq('module_id', moduleId)
    .eq('company_id', companyId)
  const items = (itemRows ?? []) as Array<Pick<TrainingItem, 'id' | 'required'>>

  const itemIds = items.map((i) => i.id)
  const progressByItem = new Map<string, Pick<TrainingItemProgress, 'status'>>()
  if (itemIds.length > 0) {
    const { data: progressRows } = await supabaseAdmin
      .from('ess_training_item_progress')
      .select('item_id, status')
      .eq('employee_id', employeeId)
      .eq('company_id', companyId)
      .in('item_id', itemIds)
    for (const p of progressRows ?? []) {
      progressByItem.set(p.item_id as string, { status: p.status as TrainingProgressStatus })
    }
  }

  const completed = completedItemIds(items, progressByItem)
  const percent = computePercentComplete(items, completed)
  const status = statusForPercent(percent)

  // Read the existing module-progress row to detect a fresh completion.
  const { data: existing } = await supabaseAdmin
    .from('ess_training_progress')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('module_id', moduleId)
    .maybeSingle()
  const prev = existing as { status?: TrainingProgressStatus; started_at?: string | null; expires_at?: string | null } | null

  const nowIso = new Date().toISOString()
  const wasComplete = prev?.status === 'complete'
  // Expiry: stamp on a FRESH completion from the module's validity; preserve the
  // existing value if it was already complete (don't keep pushing expiry out).
  const expiresAt =
    status === 'complete'
      ? wasComplete
        ? prev?.expires_at ?? null
        : validityMonths
          ? calcExpiry(nowIso.slice(0, 10), validityMonths)
          : null
      : null
  const row = {
    company_id: companyId,
    employee_id: employeeId,
    module_id: moduleId,
    percent_complete: percent,
    status,
    started_at: prev?.started_at ?? (status !== 'not_started' ? nowIso : null),
    completed_at: status === 'complete' ? nowIso : null,
    expires_at: expiresAt,
  }

  const { error } = await supabaseAdmin
    .from('ess_training_progress')
    .upsert(row, { onConflict: 'employee_id,module_id' })
  if (error) console.error('[training] module progress upsert failed:', error.message)

  const justCompleted = status === 'complete' && prev?.status !== 'complete'
  if (justCompleted) {
    await recordTrainingEvent({
      companyId,
      employeeId,
      moduleId,
      event: 'module_completed',
      meta: { percent },
    })
    await recordAudit({
      companyId,
      action: 'training.module.completed',
      target: { type: 'training_module', id: moduleId },
      meta: { employee_id: employeeId },
    })
    // Cross-phase hooks (guarded; may not exist in this worktree).
    await tryAdvanceOnboarding(employeeId, moduleId)
    await tryRecertHook(companyId, employeeId, moduleId)
  }

  return percent
}
