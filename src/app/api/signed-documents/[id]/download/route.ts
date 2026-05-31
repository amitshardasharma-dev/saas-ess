import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { createSignedDownloadUrl } from '@/services/esign'

/**
 * GET /api/signed-documents/[id]/download
 *
 * Mint a short-lived signed URL for a signed PDF. Re-checks company ownership
 * (the IDOR-safe pattern from the tenant-isolation audit): a cross-tenant id
 * resolves to null -> 404 (never reveals existence).
 */
export const GET = withAuth(async (_request, { companyId, appUser }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  try {
    await assertModuleEnabled(companyId, 'documents_esign')
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }

  const result = await createSignedDownloadUrl(companyId, id, appUser.id, 60)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ url: result.url, expires_in: 60 })
})
