// /api/settings/certificate/signature — upload the signature printed on
// certificates, e.g. the Director's (MOS-748). Accepts an uploaded PNG/JPG or a
// signature drawn in the browser (sent as PNG). Max 1MB; new path each time.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { uploadCertificateAsset } from '@/lib/certificates/assets'

export const POST = withAuth(
  async (request: NextRequest, ctx: AuthContext) => {
    const formData = await request.formData().catch(() => null)
    const result = await uploadCertificateAsset(ctx.companyId, formData?.get('file'), 'signature')
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ signature_url: result.url })
  },
  { minRole: 'admin' },
)
