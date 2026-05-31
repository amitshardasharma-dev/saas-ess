import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { listSignedDocuments } from '@/services/esign'

/**
 * GET /api/signed-documents?employee_id=&document_id=&version_id=
 *
 * PUBLISHED CONTRACT (spec §6): Phase 2 profile widget + Phase 7 reporting read
 * this. Always company-scoped. Returns immutable signed-document records.
 */
export const GET = withAuth(async (request, { companyId }) => {
  try {
    await assertModuleEnabled(companyId, 'documents_esign')
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }

  const url = new URL(request.url)
  const employeeId = url.searchParams.get('employee_id') ?? undefined
  const documentId = url.searchParams.get('document_id') ?? undefined
  const versionId = url.searchParams.get('version_id') ?? undefined

  const signed = await listSignedDocuments(companyId, { employeeId, documentId, versionId })
  return NextResponse.json({ signed_documents: signed })
})
