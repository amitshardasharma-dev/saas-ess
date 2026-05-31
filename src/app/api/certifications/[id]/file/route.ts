// /api/certifications/:id/file
//   GET  -> ownership-checked signed download URL from the PRIVATE 'certifications'
//           bucket. Cross-tenant id -> 404 (no IDOR). Missing file -> 404.
//   POST -> upload evidence (multipart 'file') to the private bucket and persist
//           file_url + file_name. HR+ only; writes audit.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'

// Private bucket for certification evidence (conventions §9: private by default,
// access via signed URLs). Distinct from the public 'ess-contracts' bucket.
export const CERT_BUCKET = 'certifications'
const SIGNED_URL_TTL_SECONDS = 60
const MAX_BYTES = 20 * 1024 * 1024

async function ensureModule(companyId: string): Promise<NextResponse | null> {
  try {
    await assertModuleEnabled(companyId, 'compliance')
    return null
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw err
  }
}

// Storage path namespaced by company so tenant isolation is explicit at the
// storage layer too: <companyId>/<certId>/<filename>.
function buildObjectPath(companyId: string, certId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${companyId}/${certId}/${safe}`
}

export const GET = withAuth(async (_request: NextRequest, ctx: AuthContext, params) => {
  const { companyId } = ctx
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

  const moduleErr = await ensureModule(companyId)
  if (moduleErr) return moduleErr

  // Tenant-scoped fetch: a cert in another company yields no row -> 404 (no IDOR).
  const { data: cert, error: fetchErr } = await supabaseAdmin
    .from('ess_certifications')
    .select('id, file_url')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()
  if (fetchErr || !cert) {
    return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
  }
  if (!cert.file_url) {
    return NextResponse.json({ error: 'No file attached' }, { status: 404 })
  }

  // file_url stores the object PATH within the private bucket (not a public URL).
  const { data, error } = await supabaseAdmin.storage
    .from(CERT_BUCKET)
    .createSignedUrl(cert.file_url, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    console.error('Cert signed URL error:', error)
    return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS })
})

export const POST = withAuth(
  async (request: NextRequest, ctx: AuthContext, params) => {
    const { companyId, appUser } = ctx
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

    const moduleErr = await ensureModule(companyId)
    if (moduleErr) return moduleErr

    const { data: cert, error: fetchErr } = await supabaseAdmin
      .from('ess_certifications')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()
    if (fetchErr || !cert) {
      return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
    }

    const formData = await request.formData().catch(() => null)
    const file = formData?.get('file')
    if (!formData || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File size must be under 20MB' }, { status: 400 })
    }

    const objectPath = buildObjectPath(companyId, cert.id, file.name || 'evidence')
    const buffer = Buffer.from(await file.arrayBuffer())

    const upload = async () =>
      supabaseAdmin.storage.from(CERT_BUCKET).upload(objectPath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    let { error: uploadError } = await upload()
    if (uploadError) {
      // Create the private bucket on first use, then retry once.
      if (uploadError.message?.includes('not found')) {
        await supabaseAdmin.storage.createBucket(CERT_BUCKET, {
          public: false,
          fileSizeLimit: MAX_BYTES,
        })
        ;({ error: uploadError } = await upload())
      }
      if (uploadError) {
        console.error('Cert file upload error:', uploadError)
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
      }
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('ess_certifications')
      .update({ file_url: objectPath, file_name: file.name, updated_at: new Date().toISOString() })
      .eq('id', cert.id)
      .eq('company_id', companyId)
      .select()
      .single()
    if (updateErr || !updated) {
      console.error('Cert file_url update error:', updateErr)
      return NextResponse.json({ error: 'File uploaded but record update failed' }, { status: 500 })
    }

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'certification.file_uploaded',
      target: { type: 'certification', id: cert.id },
    })

    return NextResponse.json(
      { certification: updated, file_name: file.name },
      { status: 201 },
    )
  },
  { minRole: 'hr' },
)
