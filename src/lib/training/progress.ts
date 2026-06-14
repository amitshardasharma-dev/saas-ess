// src/lib/training/progress.ts
//
// Pure (no I/O) progress math. Kept Supabase-free so it is unit-testable and
// shareable between the server recompute and any client-side preview.

import type { TrainingItem, TrainingItemProgress } from '@/types/training'

/** A minimal item shape for completion math (required flag only). */
export interface RequiredFlaggable {
  id: string
  required: boolean
}

/**
 * Compute module percent-complete from item completion.
 *
 * Definition (spec §4/§7): required items complete / total required.
 * Optional items are ignored entirely. A module with zero required items is
 * considered 100% complete (nothing mandatory left to do).
 *
 * @param items          all items in the module
 * @param completedItemIds set of item ids the employee has completed
 * @returns integer percent in [0, 100]
 */
export function computePercentComplete(
  items: RequiredFlaggable[],
  completedItemIds: Set<string> | string[]
): number {
  const completed = completedItemIds instanceof Set ? completedItemIds : new Set(completedItemIds)
  const required = items.filter((i) => i.required)
  if (required.length === 0) return 100
  const done = required.filter((i) => completed.has(i.id)).length
  return Math.round((done / required.length) * 100)
}

/** Derive the module status from a percent value. */
export function statusForPercent(percent: number): 'not_started' | 'in_progress' | 'complete' {
  if (percent >= 100) return 'complete'
  if (percent <= 0) return 'not_started'
  return 'in_progress'
}

/**
 * Given items + their per-item progress rows, return the set of completed item
 * ids. An item counts as complete when its progress.status === 'complete'.
 */
export function completedItemIds(
  items: Pick<TrainingItem, 'id'>[],
  progressByItem: Map<string, Pick<TrainingItemProgress, 'status'>>
): Set<string> {
  const done = new Set<string>()
  for (const item of items) {
    if (progressByItem.get(item.id)?.status === 'complete') done.add(item.id)
  }
  return done
}
