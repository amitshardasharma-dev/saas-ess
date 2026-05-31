// src/lib/recertification/scan.ts
//
// Phase 7 — recertification scan core (spec §4.4). When a certification has expired
// (daysUntil < 0) and has no open recert, create an ess_recertifications row,
// auto-assign the mapped Phase 5 training module, notify the volunteer, and write
// ess_recert_history + audit.
//
// Cross-phase contracts (read defensively):
//  - Phase 3: ess_certifications, ess_cert_types (recert_module_id mapping lives in
//    ess_cert_types.settings.recert_module_id by contract).
//  - Phase 5: ess_training_assignments — we insert an assignment if the table exists.

import { supabaseAdmin } from '@/lib/supabase-server'
import { sendEmail } from '@/lib/email/send'
import { recordAudit } from '@/lib/audit'
import { daysUntil } from '@/lib/compliance/expiry'

interface CertRow {
  id: string
  company_id: string
  employee_id: string
  expiry_date: string | null
  cert_type_id: string | null
}

export interface RecertScanResult {
  expiredFound: number
  recertsCreated: number
  modulesAssigned: number
}

async function emailFor(employeeId: string): Promise<string | null> {
  const { data: emp } = await supabaseAdmin
    .from('ess_employees')
    .select('app_user_id')
    .eq('id', employeeId)
    .single()
  const appUserId = (emp as { app_user_id?: string | null } | null)?.app_user_id
  if (!appUserId) return null
  const { data: au } = await supabaseAdmin.from('ess_app_users').select('email').eq('id', appUserId).single()
  return (au as { email?: string | null } | null)?.email ?? null
}

/** Resolve the recert training module for a cert type via its settings mapping. */
async function moduleForCertType(certTypeId: string | null): Promise<string | null> {
  if (!certTypeId) return null
  try {
    const { data } = await supabaseAdmin
      .from('ess_cert_types')
      .select('settings')
      .eq('id', certTypeId)
      .single()
    const settings = (data as { settings?: Record<string, unknown> | null } | null)?.settings
    const moduleId = settings && typeof settings === 'object' ? (settings.recert_module_id as string | undefined) : undefined
    return moduleId ?? null
  } catch {
    return null
  }
}

/**
 * Run the recertification scan for one company. `today` is injectable for tests.
 */
export async function scanRecertifications(companyId: string, today: Date = new Date()): Promise<RecertScanResult> {
  const result: RecertScanResult = { expiredFound: 0, recertsCreated: 0, modulesAssigned: 0 }

  const { data: certs } = await supabaseAdmin
    .from('ess_certifications')
    .select('id, company_id, employee_id, expiry_date, cert_type_id')
    .eq('company_id', companyId)

  for (const cert of (certs ?? []) as CertRow[]) {
    const days = daysUntil(cert.expiry_date, today)
    if (days === null || days >= 0) continue
    result.expiredFound += 1

    // Skip if an open recert already exists for this cert (idempotent).
    const { data: existing } = await supabaseAdmin
      .from('ess_recertifications')
      .select('id')
      .eq('certification_id', cert.id)
      .limit(1)
    if (existing && existing.length > 0) continue

    const moduleId = await moduleForCertType(cert.cert_type_id)

    const { data: recertRow } = await supabaseAdmin
      .from('ess_recertifications')
      .insert({
        company_id: companyId,
        employee_id: cert.employee_id,
        certification_id: cert.id,
        assigned_module_id: moduleId,
        status: 'assigned',
      })
      .select('id')
      .single()
    const recertId = (recertRow as { id?: string } | null)?.id
    if (!recertId) continue
    result.recertsCreated += 1

    await supabaseAdmin.from('ess_recert_history').insert({
      recertification_id: recertId,
      event: 'created',
      detail: `Certification ${cert.id} expired (${cert.expiry_date}); recert opened.`,
    })

    // Auto-assign the mapped Phase 5 training module (best-effort, by contract).
    if (moduleId) {
      try {
        await supabaseAdmin.from('ess_training_assignments').insert({
          company_id: companyId,
          module_id: moduleId,
          employee_id: cert.employee_id,
          status: 'assigned',
          source: 'recertification',
        })
        await supabaseAdmin.from('ess_recert_history').insert({
          recertification_id: recertId,
          event: 'module_assigned',
          detail: `Training module ${moduleId} assigned.`,
        })
        result.modulesAssigned += 1
      } catch {
        // LMS not merged in this worktree — recert still tracked without assignment.
      }
    }

    // Notify the volunteer.
    const recipientEmail = await emailFor(cert.employee_id)
    if (recipientEmail) {
      await sendEmail({
        to: recipientEmail,
        subject: 'Recertification required',
        html: '<p>One of your certifications has expired. A recertification has been opened and any required refresher training has been assigned.</p>',
        companyId,
      })
    }

    await recordAudit({
      companyId,
      action: 'recert.created',
      target: { type: 'recertification', id: recertId },
      meta: { certificationId: cert.id, moduleId, employeeId: cert.employee_id },
    })
  }

  return result
}

/**
 * Mark a recert completed when its assigned module is finished (spec §4.4). Idempotent.
 * Returns true if a transition happened.
 */
export async function completeRecertForModule(
  companyId: string,
  employeeId: string,
  moduleId: string,
): Promise<boolean> {
  const { data: open } = await supabaseAdmin
    .from('ess_recertifications')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('assigned_module_id', moduleId)
    .neq('status', 'completed')
    .limit(1)
  const recert = open?.[0] as { id: string } | undefined
  if (!recert) return false

  await supabaseAdmin
    .from('ess_recertifications')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', recert.id)
  await supabaseAdmin.from('ess_recert_history').insert({
    recertification_id: recert.id,
    event: 'completed',
    detail: `Refresher module ${moduleId} completed.`,
  })
  await recordAudit({
    companyId,
    action: 'recert.completed',
    target: { type: 'recertification', id: recert.id },
    meta: { moduleId, employeeId },
  })
  return true
}
