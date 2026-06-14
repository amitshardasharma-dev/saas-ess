import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { SignSchema } from '@/types/esign'
import {
  createSignedDocument,
  getVersionForCompany,
  FieldValidationError,
  SigningError,
} from '@/services/esign'

function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')
}

/**
 * POST /api/documents/[id]/sign
 * Complete + sign a document version. Any authenticated member (the signer) may
 * sign their own assigned document. Body: { versionId, signerName, signatureType,
 * fieldValues, signatureDataUrl? }. Captures IP + user-agent from request headers.
 */
export const POST = withAuth(async (request, { companyId, employee, appUser }, params) => {
  const documentId = params?.id
  if (!documentId) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  if (!employee) return NextResponse.json({ error: 'No employee record' }, { status: 404 })

  try {
    await assertModuleEnabled(companyId, 'documents_esign')
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }

  const body = await request.json()
  const parsed = SignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // The version must belong to caller's company AND to this document (else 404).
  const ctx = await getVersionForCompany(companyId, parsed.data.versionId)
  if (!ctx || ctx.documentId !== documentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const signed = await createSignedDocument({
      companyId,
      employeeId: employee.id,
      versionId: parsed.data.versionId,
      signerName: parsed.data.signerName,
      signatureType: parsed.data.signatureType,
      fieldValues: parsed.data.fieldValues,
      signatureDataUrl: parsed.data.signatureDataUrl,
      signingLocation: parsed.data.signingLocation,
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    })
    void appUser
    return NextResponse.json(
      { signed_document: { id: signed.id, content_hash: signed.content_hash }, message: 'Document signed' },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof FieldValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof SigningError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
})
