// src/types/communications.ts
//
// Phase 7 — Communications types + Zod schemas (colocated per conventions §6.5).
// Published contract: ess_messages, ess_message_targets, ess_message_recipients,
// ess_message_templates.

import { z } from 'zod'

export type MessageStatus = 'draft' | 'sent'

export type MessageTargetType = 'role' | 'org_unit' | 'group' | 'user' | 'all'

export interface MessageTarget {
  id: string
  message_id: string
  target_type: MessageTargetType
  target_value: string | null
}

export interface Message {
  id: string
  company_id: string
  subject: string
  body_html: string
  sender_app_user_id: string | null
  status: MessageStatus
  sent_at: string | null
  created_at: string
}

export interface MessageRecipient {
  id: string
  company_id: string
  message_id: string
  employee_id: string
  read_at: string | null
  dismissed_at: string | null
  created_at: string
}

export interface MessageTemplate {
  id: string
  company_id: string
  name: string
  subject: string
  body_html: string
  created_at: string
}

/** A message as seen in a recipient's inbox (joined recipient + message). */
export interface InboxMessage {
  recipient_id: string
  message_id: string
  subject: string
  body_html: string
  sent_at: string | null
  read_at: string | null
  dismissed_at: string | null
}

export const targetSchema = z.object({
  target_type: z.enum(['role', 'org_unit', 'group', 'user', 'all']),
  // 'all' carries no value; others carry the role/org_unit/group id/employee id.
  target_value: z.string().nullable().optional(),
})

export const composeMessageSchema = z.object({
  subject: z.string().min(1).max(300),
  body_html: z.string().min(1),
  targets: z.array(targetSchema).min(1),
  /** When true, also deliver by email via Phase 0 sendEmail (best-effort). */
  send_email: z.boolean().optional().default(false),
  /** Persist as draft instead of sending immediately. */
  draft: z.boolean().optional().default(false),
})
export type ComposeMessageInput = z.infer<typeof composeMessageSchema>

export const templateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(300),
  body_html: z.string().min(1),
})
export type TemplateInput = z.infer<typeof templateSchema>
