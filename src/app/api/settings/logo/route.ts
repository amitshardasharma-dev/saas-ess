// /api/settings/logo — upload a tenant logo (admin). Stores it in the PUBLIC
// 'ess-branding' bucket and saves the public URL to ess_companies.settings.logo_url.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'

const BUCKET = 'ess-branding'
const MAX_BYTES = 3 * 1024 * 1024

export const POST = withAuth(
  async (request: NextRequest, ctx: AuthContext) => {
    const formData = await request.formData().catch(() => null)
    const file = formData?.get('file')
    if (!formData || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Logo must be under 3MB' }, { status: 400 })
    }
    if (!/^image\//.test(file.type || '')) {
      return NextResponse.json({ error: 'Logo must be an image' }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
    const objectPath = `${ctx.companyId}/logo-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const upload = async () =>
      supabaseAdmin.storage.from(BUCKET).upload(objectPath, buffer, { contentType: file.type || 'image/png', upsert: true })

    let { error: uploadError } = await upload()
    if (uploadError) {
      if (uploadError.message?.includes('not found')) {
        await supabaseAdmin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES })
        ;({ error: uploadError } = await upload())
      }
      if (uploadError) {
        console.error('Logo upload error:', uploadError)
        return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
      }
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath)
    const logoUrl = pub.publicUrl

    // Merge into company settings.
    const { data: company } = await supabaseAdmin.from('ess_companies').select('settings').eq('id', ctx.companyId).single()
    const merged = { ...(company?.settings || {}), logo_url: logoUrl }
    const { error: updErr } = await supabaseAdmin.from('ess_companies').update({ settings: merged }).eq('id', ctx.companyId)
    if (updErr) return NextResponse.json({ error: 'Uploaded but failed to save' }, { status: 500 })

    await recordAudit({
      companyId: ctx.companyId,
      actorId: ctx.appUser.id,
      action: 'settings.logo_updated',
      target: { type: 'company', id: ctx.companyId },
    })

    return NextResponse.json({ logo_url: logoUrl })
  },
  { minRole: 'admin' },
)
