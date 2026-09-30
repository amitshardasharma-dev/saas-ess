// /api/settings/certificate/logo — upload the certificate logo (MOS-721).
// PNG or JPEG only (the formats a PDF can embed), max 1MB. Stored under a new
// path each time so certificates issued with an older logo keep it.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { uploadCertificateAsset } from '@/lib/certificates/assets'

export const POST = withAuth(
  async (request: NextRequest, ctx: AuthContext) => {
    const formData = await request.formData().catch(() => null)
    const result = await uploadCertificateAsset(ctx.companyId, formData?.get('file'), 'logo')
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ logo_url: result.url })
  },
  { minRole: 'admin' },
)
