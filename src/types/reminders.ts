// src/types/reminders.ts
//
// Phase 7 — Expiry reminder config + send-log types + Zod schemas.
// Published contract: ess_reminder_configs, ess_reminder_sends.

import { z } from 'zod'

export type ReminderAppliesTo = 'certification' | 'contract' | 'custom'
export type ReminderFrequency = 'once' | 'weekly' | 'daily_overdue'
export type ReminderEscalateTo = 'supervisor' | 'admin' | 'none'

export interface ReminderConfig {
  id: string
  company_id: string
  applies_to: ReminderAppliesTo
  /** Days relative to expiry, e.g. {90,30,7,0,-7}; negative = overdue. */
  offsets: number[]
  frequency: ReminderFrequency
  email_subject: string
  email_body_html: string
  escalate_to: ReminderEscalateTo
  is_active: boolean
  created_at: string
}

export interface ReminderSend {
  id: string
  company_id: string
  reminder_config_id: string
  certification_id: string | null
  employee_id: string
  offset_sent: number
  sent_at: string
}

export const reminderConfigSchema = z.object({
  applies_to: z.enum(['certification', 'contract', 'custom']),
  offsets: z.array(z.number().int()).min(1),
  frequency: z.enum(['once', 'weekly', 'daily_overdue']),
  email_subject: z.string().min(1).max(300),
  email_body_html: z.string().min(1),
  escalate_to: z.enum(['supervisor', 'admin', 'none']),
  is_active: z.boolean().optional().default(true),
})
export type ReminderConfigInput = z.infer<typeof reminderConfigSchema>
