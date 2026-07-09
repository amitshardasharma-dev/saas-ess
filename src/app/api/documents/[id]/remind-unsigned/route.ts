// POST /api/documents/[id]/remind-unsigned  (hr+)
// Sends an inbox reminder to every employee who has NOT signed this document.
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

    const { data: employees } = await supabaseAdmin
      .from('ess_employees')
      .select('id')
      .eq('company_id', companyId)

    const signed = await listSignedDocuments(companyId, { documentId })
    const signedIds = new Set(signed.map((s) => s.employee_id))
    const nonSigners = (employees || []).filter((e) => !signedIds.has(e.id))

    const title = (doc as { title?: string }).title ?? 'a document'
    const signUrl = `${APP_URL}/dashboard/documents/${documentId}/sign`
    const subject = `Action required: please sign "${title}"`
    const bodyHtml = `
      <p>You have a document awaiting your signature: <strong>${escapeHtml(title)}</strong>.</p>
      <p>Please review and sign it at your earliest convenience.</p>
      <p><a href="${signUrl}" style="color:#0d9488">Review &amp; sign now →</a></p>`

    let reminded = 0
    for (const emp of nonSigners) {
      const id = await notifyEmployeeInbox({
        companyId,
        employeeId: emp.id,
        senderAppUserId: appUser.id,
        subject,
        bodyHtml,
      })
      if (id) reminded += 1
    }

    return NextResponse.json({ reminded, non_signers: nonSigners.length })
  },
  { minRole: 'hr' },
)
