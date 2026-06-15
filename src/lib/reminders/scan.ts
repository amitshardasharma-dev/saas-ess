// src/lib/reminders/scan.ts
//
// Phase 7 — expiry reminder scan core. Pure-ish orchestration around the Phase 3
// compliance contract (ess_certifications + calcStatus/daysUntil) and the Phase 0
// email + audit services. Extracted from the job handler so it is unit-testable.
//
// Behaviour (spec §4.3):
//  - For each ACTIVE reminder config in a company:
//      * Find certs whose daysUntil(expiry) triggers under the config (see below).
//      * For each (cert, trigger) not already in ess_reminder_sends, send a templated
//        email to the volunteer and record the send (dedupe per offset_sent).
//      * Negative offsets are "overdue" — escalate to supervisor/admin per config.
//  - Dedupe is enforced both in-code and by the DB unique (config, cert, offset_sent).
//
// FREQUENCY (config.frequency) — controls how the OVERDUE path repeats. The
// before/on-expiry offsets are always "once per offset" (you never want to re-nag
// the 90-day notice every day); frequency only governs negative-offset re-sends:
//   - 'once'         : fire only on the literal configured negative offsets.
//   - 'weekly'       : also fire every 7 days once overdue (days <= most-overdue offset).
//   - 'daily_overdue': fire every day once overdue.
// Each overdue send records offset_sent = days (the actual whole-day count, which is
// distinct per calendar day), so repeats never collide with the DB unique constraint
// and a cert can be reminded at most once per calendar day per config.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email/send'
import { recordAudit } from '@/lib/audit'
import { daysUntil } from '@/lib/compliance/expiry'
import type { ReminderConfig } from '@/types/reminders'

interface CertRow {
  id: string
  company_id: string
  employee_id: string
  expiry_date: string | null
  cert_type_id: string | null
}

interface EmployeeRow {
  id: string
  full_name: string | null
  reports_to: string | null
  app_user_id: string | null
}

export interface ScanResult {
  configsProcessed: number
  remindersSent: number
  escalations: number
  skippedDuplicate: number
}

/** Fill {{name}} / {{cert_name}} / {{cert}} / {{days}} / {{expiry}} tokens. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '')
}

async function emailFor(employeeId: string): Promise<string | null> {
  const { data: emp } = await supabaseAdmin
    .from('ess_employees')
    .select('app_user_id')
    .eq('id', employeeId)
    .single()
  const appUserId = (emp as { app_user_id?: string | null } | null)?.app_user_id
  if (!appUserId) return null
  const { data: au } = await supabaseAdmin
    .from('ess_app_users')
    .select('email')
    .eq('id', appUserId)
    .single()
  return (au as { email?: string | null } | null)?.email ?? null
}

/**
 * Decide whether a cert at `days` until expiry should trigger a reminder under
 * `config`, given its frequency. Pure — no I/O — so the cadence rule is unit-clear.
 *
 *  - days >= 0 (before / on expiry): trigger iff `days` is one of the configured
 *    offsets. Always once-per-offset regardless of frequency.
 *  - days < 0 (overdue): a literal configured offset always triggers. Beyond that,
 *    'weekly' triggers every 7 days and 'daily_overdue' triggers every day, but only
 *    once `days` has reached the most-overdue (smallest) configured offset so we
 *    don't start nagging before the admin's first overdue checkpoint.
 */
export function shouldTrigger(config: ReminderConfig, days: number): boolean {
  if (config.offsets.includes(days)) return true
  if (days >= 0) return false

  const overdueOffsets = config.offsets.filter((o) => o < 0)
  if (overdueOffsets.length === 0) return false
  const deepestOverdue = Math.min(...overdueOffsets) // most negative configured offset
  if (days > deepestOverdue) return false // not yet at the first overdue checkpoint

  if (config.frequency === 'daily_overdue') return true
  if (config.frequency === 'weekly') return days % 7 === 0
  return false // 'once' — only the literal offsets above
}

/**
 * Run the reminder scan for one company. `today` is injectable for deterministic
 * tests. Returns aggregate counters.
 */
export async function scanReminders(companyId: string, today: Date = new Date()): Promise<ScanResult> {
  const result: ScanResult = { configsProcessed: 0, remindersSent: 0, escalations: 0, skippedDuplicate: 0 }

  const { data: configs } = await supabaseAdmin
    .from('ess_reminder_configs')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)

  const activeConfigs = (configs ?? []) as ReminderConfig[]

  for (const config of activeConfigs) {
    result.configsProcessed += 1
    if (config.applies_to !== 'certification') continue // only cert reminders implemented

    const { data: certs } = await supabaseAdmin
      .from('ess_certifications')
      .select('id, company_id, employee_id, expiry_date, cert_type_id')
      .eq('company_id', companyId)

    for (const cert of (certs ?? []) as CertRow[]) {
      const days = daysUntil(cert.expiry_date, today)
      if (days === null) continue
      if (!shouldTrigger(config, days)) continue

      // Dedupe guard: has this (config, cert, offset_sent=days) already been sent?
      // For overdue re-sends, `days` is distinct per calendar day, so this both
      // dedupes within a day and lets the next day's run send again.
      const { data: existing } = await supabaseAdmin
        .from('ess_reminder_sends')
        .select('id')
        .eq('reminder_config_id', config.id)
        .eq('certification_id', cert.id)
        .eq('offset_sent', days)
        .limit(1)
      if (existing && existing.length > 0) {
        result.skippedDuplicate += 1
        continue
      }

      const { data: empData } = await supabaseAdmin
        .from('ess_employees')
        .select('id, full_name, reports_to, app_user_id')
        .eq('id', cert.employee_id)
        .single()
      const employee = empData as EmployeeRow | null

      // Certification type name for the {{cert_name}} / {{cert}} tokens.
      let certName = 'certification'
      if (cert.cert_type_id) {
        const { data: ct } = await supabaseAdmin
          .from('ess_cert_types')
          .select('name')
          .eq('id', cert.cert_type_id)
          .single()
        certName = (ct as { name?: string | null } | null)?.name ?? certName
      }

      const recipientEmail = await emailFor(cert.employee_id)
      const vars = {
        name: employee?.full_name ?? 'Volunteer',
        cert_name: certName,
        cert: certName,
        days: String(days),
        expiry: cert.expiry_date ?? '',
      }
      const subject = render(config.email_subject || 'Certification reminder', vars)
      const html = render(config.email_body_html || '<p>Your certification is due.</p>', vars)

      if (recipientEmail) {
        await sendEmail({ to: recipientEmail, subject, html, companyId })
      }

      // Record the send for dedupe + audit trail.
      await supabaseAdmin.from('ess_reminder_sends').insert({
        company_id: companyId,
        reminder_config_id: config.id,
        certification_id: cert.id,
        employee_id: cert.employee_id,
        offset_sent: days,
      })
      await recordAudit({
        companyId,
        action: 'reminder.sent',
        target: { type: 'certification', id: cert.id },
        meta: { offset: days, to: recipientEmail, config: config.id },
      })
      result.remindersSent += 1

      // Escalation for overdue (negative offset) per config.
      if (days < 0 && config.escalate_to !== 'none') {
        let escalationEmail: string | null = null
        if (config.escalate_to === 'supervisor' && employee?.reports_to) {
          escalationEmail = await emailFor(employee.reports_to)
        } else if (config.escalate_to === 'admin') {
          const { data: admins } = await supabaseAdmin
            .from('ess_app_users')
            .select('email')
            .eq('company_id', companyId)
            .eq('role', 'admin')
            .limit(1)
          escalationEmail = (admins?.[0] as { email?: string } | undefined)?.email ?? null
        }
        if (escalationEmail) {
          await sendEmail({
            to: escalationEmail,
            subject: `[Overdue] ${subject}`,
            html: `<p>An overdue certification needs attention for ${vars.name}.</p>${html}`,
            companyId,
          })
          await recordAudit({
            companyId,
            action: 'reminder.escalated',
            target: { type: 'certification', id: cert.id },
            meta: { to: escalationEmail, escalateTo: config.escalate_to, offset: days },
          })
          result.escalations += 1
        }
      }
    }
  }

  return result
}
