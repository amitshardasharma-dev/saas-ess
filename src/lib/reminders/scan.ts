// src/lib/reminders/scan.ts
//
// Phase 7 — expiry reminder scan core. Pure-ish orchestration around the Phase 3
// compliance contract (ess_certifications + calcStatus/daysUntil) and the Phase 0
// email + audit services. Extracted from the job handler so it is unit-testable.
//
// Behaviour (spec §4.3):
//  - For each ACTIVE reminder config in a company:
//      * Find certs whose daysUntil(expiry) === one of the config offsets.
//      * For each (cert, offset) not already in ess_reminder_sends, send a templated
//        email to the volunteer and record the send (dedupe per offset).
//      * Negative offsets are "overdue" — escalate to supervisor/admin per config.
//  - Dedupe is enforced both in-code and by the DB unique (config, cert, offset).

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

/** Fill {{name}} / {{days}} / {{expiry}} tokens in a template string. */
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
      if (!config.offsets.includes(days)) continue

      // Dedupe guard: has this (config, cert, offset) already been sent?
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

      const recipientEmail = await emailFor(cert.employee_id)
      const vars = {
        name: employee?.full_name ?? 'Volunteer',
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
