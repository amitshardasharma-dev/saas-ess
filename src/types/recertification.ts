// src/types/recertification.ts
//
// Phase 7 — Recertification workflow types + Zod schemas.
// Published contract: ess_recertifications, ess_recert_history.

import { z } from 'zod'

export type RecertStatus = 'assigned' | 'in_progress' | 'completed'

export interface Recertification {
  id: string
  company_id: string
  employee_id: string
  certification_id: string
  triggered_at: string
  assigned_module_id: string | null
  status: RecertStatus
  completed_at: string | null
  created_at: string
}

export interface RecertHistoryEntry {
  id: string
  recertification_id: string
  event: string
  detail: string | null
  created_at: string
}

/**
 * Maps a cert type to the training module assigned when that cert expires.
 * Stored on ess_cert_types.settings.recert_module_id (no new table) — but a
 * config endpoint accepts this shape for clarity.
 */
export const recertMappingSchema = z.object({
  cert_type_id: z.string().uuid(),
  module_id: z.string().uuid(),
})
export type RecertMappingInput = z.infer<typeof recertMappingSchema>
