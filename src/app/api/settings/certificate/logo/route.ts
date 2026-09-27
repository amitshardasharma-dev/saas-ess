// /api/settings/certificate/logo — upload the certificate logo (MOS-721).
// PNG or JPEG only (the formats a PDF can embed), max 1MB. Stored under a new
// path each time so certificates issued with an older logo keep it.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { detectLogoFormat, LOGO_MAX_BYTES } from '@/lib/certificates/render'

const BUCKET = 'ess-branding'

export const POST = withAuth(
  async (request: NextRequest, ctx: AuthContext) => {
    const formData = await request.formData().catch(() => null)
    const file = formData?.get('file')
    if (!formData || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (file.size > LOGO_MAX_BYTES) {
      return NextResponse.json(
        { error: `Logo is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please use a PNG or JPG under 1MB.` },
        { status: 400 },
      )
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const fmt = detectLogoFormat(bytes)
    if (!fmt) {
      return NextResponse.json(
        { error: 'Certificates support PNG or JPG logos only. Please convert your logo (e.g. SVG or WebP) to PNG and try again.' },
        { status: 400 },
      )
    }

    const contentType = fmt === 'png' ? 'image/png' : 'image/jpeg'
    const objectPath = `${ctx.companyId}/certificate-logo-${Date.now()}.${fmt}`
    const upload = async () =>
      supabaseAdmin.storage.from(BUCKET).upload(objectPath, Buffer.from(bytes), { contentType, upsert: false })

    let { error } = await upload()
    if (error?.message?.includes('not found')) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 3 * 1024 * 1024 })
      ;({ error } = await upload())
    }
    if (error) {
      console.error('Certificate logo upload error:', error)
      return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
    }
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath)
    return NextResponse.json({ logo_url: pub.publicUrl })
  },
  { minRole: 'admin' },
)
