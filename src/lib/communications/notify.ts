// Deliver a direct, system-generated message to a single employee's in-portal
// inbox. Reuses the same ess_messages + ess_message_recipients tables the
// HR broadcast composer writes to, so these notifications render in the existing
// inbox with no extra plumbing. Best-effort by contract: callers wrap in
// try/catch — a failed notification must never fail the action that triggered it.
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface NotifyInboxInput {
  companyId: string
  /** The recipient's ess_employees.id. */
  employeeId: string
  /** The acting user's ess_app_users.id (sender); null for purely automated. */
  senderAppUserId: string | null
  subject: string
  /** Pre-rendered, trusted HTML body (built server-side, never raw user input). */
  bodyHtml: string
}

/**
 * Insert a 'sent' message and a recipient row for one employee. Returns the new
 * message id, or null if delivery failed (logged, non-fatal).
 */
export async function notifyEmployeeInbox(input: NotifyInboxInput): Promise<string | null> {
  const { companyId, employeeId, senderAppUserId, subject, bodyHtml } = input
  try {
    const { data: msg, error: msgErr } = await supabaseAdmin
      .from('ess_messages')
      .insert({
        company_id: companyId,
        subject,
        body_html: bodyHtml,
        sender_app_user_id: senderAppUserId,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (msgErr || !msg) {
      console.error('[notify] message insert failed (non-fatal):', msgErr?.message)
      return null
    }

    const { error: recErr } = await supabaseAdmin
      .from('ess_message_recipients')
      .insert({ company_id: companyId, message_id: msg.id, employee_id: employeeId })
    if (recErr) {
      console.error('[notify] recipient insert failed (non-fatal):', recErr.message)
      return null
    }
    return msg.id as string
  } catch (err) {
    console.error('[notify] unexpected failure (non-fatal):', (err as Error)?.message)
    return null
  }
}

/** Minimal HTML escaping for interpolating dynamic text into notification bodies. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
