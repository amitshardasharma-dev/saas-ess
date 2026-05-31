import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { listSignedDocuments } from '@/services/esign'

/**
 * GET /api/documents/[id]/signature-status  (hr+)
 *
 * Staff/Admin view: who has / hasn't signed a document (reuses the
 * acknowledgment-tracking shape from /acknowledgments). Cross-references all
 * employees in the company against ess_signed_documents for this document.
 */
export const GET = withAuth(
  async (_request, { companyId }, params) => {
    const documentId = params?.id
    if (!documentId) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    try {
      await assertModuleEnabled(companyId, 'documents_esign')
    } catch (err) {
      if (err instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      throw err
    }

    // Confirm the document belongs to the company (cross-tenant -> 404).
    const { data: doc } = await supabaseAdmin
      .from('ess_documents')
      .select('id')
      .eq('id', documentId)
      .eq('company_id', companyId)
      .single()
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: employees } = await supabaseAdmin
      .from('ess_employees')
      .select('id, full_name, employee_no, department')
      .eq('company_id', companyId)

    const signed = await listSignedDocuments(companyId, { documentId })
    const signedByEmployee = new Map<string, { signed_at: string; id: string }>()
    for (const s of signed) {
      // keep the most recent (list is ordered desc by signed_at)
      if (!signedByEmployee.has(s.employee_id)) {
        signedByEmployee.set(s.employee_id, { signed_at: s.signed_at, id: s.id })
      }
    }

    const rows = (employees || []).map((emp) => {
      const record = signedByEmployee.get(emp.id)
      return {
        id: emp.id,
        name: emp.full_name,
        employee_no: emp.employee_no,
        department: emp.department,
        signed: !!record,
        signed_at: record?.signed_at ?? null,
        signed_document_id: record?.id ?? null,
      }
    })

    return NextResponse.json({
      total: rows.length,
      signed_count: signedByEmployee.size,
      employees: rows,
    })
  },
  { minRole: 'hr' }
)
