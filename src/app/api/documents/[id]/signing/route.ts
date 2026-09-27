// GET /api/documents/[id]/signing?versionId=&recipient=  (MOS-720)
// The signing order + progress for one copy of a document, from the viewer's
// point of view: which step is theirs, who they're waiting for, and what earlier
// signers already entered. `recipient` = whose copy (default: the viewer);
// 'shared' = the sign-once sheet. Returns { multi: false } for single-signer docs.
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { hasMinRole } from '@/types/roles'
import { getSigningState } from '@/services/signing-sequence'

export const GET = withAuth(async (request, { companyId, employee, appUser, role }, params) => {
  const documentId = params?.id
  if (!documentId) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  if (!employee) return NextResponse.json({ error: 'No employee record' }, { status: 404 })
  try {
    await assertModuleEnabled(companyId, 'documents_esign')
  } catch (err) {
    if (err instanceof ModuleDisabledError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    throw err
  }

  const url = new URL(request.url)
  const versionId = url.searchParams.get('versionId')
  if (!versionId) return NextResponse.json({ error: 'versionId required' }, { status: 400 })

  const state = await getSigningState({
    companyId,
    documentId,
    versionId,
    viewer: { employeeId: employee.id, isStaff: hasMinRole(role, 'hr'), appUserId: appUser.id },
    recipient: url.searchParams.get('recipient'),
  })
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(state)
})
