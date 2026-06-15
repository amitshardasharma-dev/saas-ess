// Shared logic for the certification review workflow (used by the review +
// message-thread routes). Route files may only export handlers, so the reusable
// pieces live here: cert lookup, access checks, thread author-name resolution,
// message insertion, and inbox-notification body builders.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { hasMinRole, type UserRole } from '@/types/roles'
import { notifyEmployeeInbox, escapeHtml } from '@/lib/communications/notify'
import type { CertMessage, VerificationStatus } from '@/types/compliance'

export interface CertRow {
  id: string
  company_id: string
  employee_id: string
  title: string
  expiry_date: string | null
  verification_status: VerificationStatus
  file_url: string | null
}

const CERT_FIELDS = 'id, company_id, employee_id, title, expiry_date, verification_status, file_url'

/** Company-scoped cert lookup. Cross-tenant id -> null (caller maps to 404). */
export async function loadCert(companyId: string, id: string): Promise<CertRow | null> {
  const { data, error } = await supabaseAdmin
    .from('ess_certifications')
    .select(CERT_FIELDS)
    .eq('id', id)
    .eq('company_id', companyId)
    .single()
  if (error || !data) return null
  return data as CertRow
}

/** hr+ may review any cert; the cert owner may read/reply on their own. */
export function isReviewer(role: UserRole): boolean {
  return hasMinRole(role, 'hr')
}
export function isOwner(cert: CertRow, employeeId?: string | null): boolean {
  return Boolean(employeeId) && cert.employee_id === employeeId
}

/** Map app_user ids -> display name (employee full_name, else email). */
async function resolveAuthorNames(appUserIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const ids = [...new Set(appUserIds.filter(Boolean))]
  if (ids.length === 0) return names
  const { data: emps } = await supabaseAdmin
    .from('ess_employees')
    .select('app_user_id, full_name')
    .in('app_user_id', ids)
  for (const e of emps ?? []) {
    const row = e as { app_user_id?: string | null; full_name?: string | null }
    if (row.app_user_id && row.full_name) names.set(row.app_user_id, row.full_name)
  }
  const missing = ids.filter((id) => !names.has(id))
  if (missing.length > 0) {
    const { data: users } = await supabaseAdmin.from('ess_app_users').select('id, email').in('id', missing)
    for (const u of users ?? []) {
      const row = u as { id: string; email?: string | null }
      if (row.email) names.set(row.id, row.email)
    }
  }
  return names
}

/** Load a cert's thread (oldest first) with resolved author names. */
export async function loadCertThread(certificationId: string): Promise<CertMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('ess_certification_messages')
    .select('id, certification_id, author_app_user_id, author_kind, body, created_at')
    .eq('certification_id', certificationId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  const names = await resolveAuthorNames(
    data.map((m) => (m as { author_app_user_id?: string | null }).author_app_user_id ?? '').filter(Boolean),
  )
  return data.map((m) => {
    const row = m as {
      id: string
      certification_id: string
      author_app_user_id: string | null
      author_kind: 'owner' | 'reviewer' | 'system'
      body: string
      created_at: string
    }
    return {
      ...row,
      author_name: row.author_app_user_id ? names.get(row.author_app_user_id) ?? null : null,
    }
  })
}

/** Append a message to a cert's thread. */
export async function addCertMessage(opts: {
  companyId: string
  certificationId: string
  authorAppUserId: string | null
  authorKind: 'owner' | 'reviewer' | 'system'
  body: string
}): Promise<void> {
  await supabaseAdmin.from('ess_certification_messages').insert({
    company_id: opts.companyId,
    certification_id: opts.certificationId,
    author_app_user_id: opts.authorAppUserId,
    author_kind: opts.authorKind,
    body: opts.body,
  })
}

const STATUS_HEADLINE: Record<Exclude<VerificationStatus, 'pending' | 'submitted'>, string> = {
  validated: 'was approved ✓',
  changes_requested: 'needs changes',
  rejected: 'was not accepted',
}

/** Notify the cert owner's inbox about a reviewer decision or message. */
export async function notifyOwnerOfReview(opts: {
  companyId: string
  employeeId: string
  reviewerAppUserId: string | null
  certTitle: string
  status: Exclude<VerificationStatus, 'pending' | 'submitted'>
  message?: string
}): Promise<void> {
  const headline = STATUS_HEADLINE[opts.status]
  const subject = `Your certificate "${opts.certTitle}" ${headline}`
  const note = opts.message
    ? `<p style="margin:8px 0 0">${escapeHtml(opts.message)}</p>`
    : ''
  const cta =
    opts.status === 'validated'
      ? '<p style="margin:8px 0 0;color:#555">No further action needed.</p>'
      : '<p style="margin:8px 0 0;color:#555">Open <strong>Certifications</strong> to view the conversation and respond.</p>'
  const bodyHtml = `<p>Your certificate <strong>${escapeHtml(opts.certTitle)}</strong> ${headline}.</p>${note}${cta}`
  await notifyEmployeeInbox({
    companyId: opts.companyId,
    employeeId: opts.employeeId,
    senderAppUserId: opts.reviewerAppUserId,
    subject,
    bodyHtml,
  })
}

/** Notify the cert owner that a reviewer left a message (no status change). */
export async function notifyOwnerOfMessage(opts: {
  companyId: string
  employeeId: string
  reviewerAppUserId: string | null
  certTitle: string
  message: string
}): Promise<void> {
  await notifyEmployeeInbox({
    companyId: opts.companyId,
    employeeId: opts.employeeId,
    senderAppUserId: opts.reviewerAppUserId,
    subject: `New message about your certificate "${opts.certTitle}"`,
    bodyHtml: `<p>A reviewer left a message about your certificate <strong>${escapeHtml(
      opts.certTitle,
    )}</strong>:</p><p style="margin:8px 0 0">${escapeHtml(
      opts.message,
    )}</p><p style="margin:8px 0 0;color:#555">Open <strong>Certifications</strong> to reply.</p>`,
  })
}
