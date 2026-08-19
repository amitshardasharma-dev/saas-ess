// POST /api/documents/[id]/remind  (hr+)
// Reminds everyone who hasn't COMPLETED this document — signing it if it has
// signature fields, otherwise acknowledging it. One endpoint for the merged
// document status report.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { listSignedDocuments } from '@/services/esign'
import { notifyEmployeeInbox, escapeHtml } from '@/lib/communications/notify'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://saas-ess.vercel.app').replace(/\/$/, '')

export const POST = withAuth(
  async (_request, { companyId, appUser }, params) => {
    const documentId = params?.id
    if (!documentId) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    try {
      await assertModuleEnabled(companyId, 'documents_esign')
    } catch (err) {
      if (err instanceof ModuleDisabledError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      throw err
    }

    const { data: doc } = await supabaseAdmin
      .from('ess_documents')
      .select('id, title')
      .eq('id', documentId)
      .eq('company_id', companyId)
      .single()
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Latest version + whether it has signature fields (=> signature document).
    const { data: versions } = await supabaseAdmin
      .from('ess_document_versions')
      .select('id')
      .eq('document_id', documentId)
      .order('version_number', { ascending: false })
      .limit(1)
    const latestVersionId = versions?.[0]?.id as string | undefined
    let isSignature = false
    if (latestVersionId) {
      const { count } = await supabaseAdmin
        .from('ess_document_fields')
        .select('id', { count: 'exact', head: true })
        .eq('version_id', latestVersionId)
      isSignature = (count ?? 0) > 0
    }

    const { data: employees } = await supabaseAdmin.from('ess_employees').select('id').eq('company_id', companyId)

    // Who has already completed it?
    const completed = new Set<string>()
    if (isSignature) {
      const signed = await listSignedDocuments(companyId, { documentId })
      for (const s of signed) completed.add(s.employee_id)
    } else if (latestVersionId) {
      const { data: acks } = await supabaseAdmin
        .from('ess_document_acknowledgments')
        .select('employee_id')
        .eq('document_id', documentId)
        .eq('version_id', latestVersionId)
      for (const a of acks || []) completed.add(a.employee_id as string)
    }
    const pending = (employees || []).filter((e) => !completed.has(e.id))

    const title = (doc as { title?: string }).title ?? 'a document'
    const url = isSignature ? `${APP_URL}/dashboard/documents/${documentId}/sign` : `${APP_URL}/dashboard/documents/${documentId}`
    const verb = isSignature ? 'sign' : 'review and acknowledge'
    const cta = isSignature ? 'Review &amp; sign now →' : 'Review &amp; acknowledge now →'
    const subject = `Action required: please ${isSignature ? 'sign' : 'acknowledge'} "${title}"`
    const bodyHtml = `
      <p>You have a document awaiting your action: <strong>${escapeHtml(title)}</strong>.</p>
      <p>Please ${verb} it at your earliest convenience.</p>
      <p><a href="${url}" style="color:#0d9488">${cta}</a></p>`

    let reminded = 0
    for (const emp of pending) {
      const id = await notifyEmployeeInbox({ companyId, employeeId: emp.id, senderAppUserId: appUser.id, subject, bodyHtml })
      if (id) reminded += 1
    }

    return NextResponse.json({ reminded, pending: pending.length, mode: isSignature ? 'signature' : 'acknowledgment' })
  },
  { minRole: 'hr' },
)
