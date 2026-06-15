// /api/profile/certifications/:id/file — SELF-SCOPED certificate evidence.
//
// The volunteer-facing counterpart to the hr-gated /api/certifications/:id/file:
// it lets any authenticated employee attach (or view) the evidence file for
// THEIR OWN certification, without the hr role the staff route requires.
//
//   GET  -> ownership-checked signed download URL from the PRIVATE 'certifications'
//           bucket. A cert that isn't the caller's own -> 404 (no IDOR, no leak).
//   POST -> upload evidence (multipart 'file') to the private bucket and persist
//           file_url + file_name on the caller's own certification.
//
// SECURITY: the certification is always fetched by (id + company_id +
// employee_id == ctx.employee.id). A cert belonging to another employee or
// tenant simply yields no row -> 404, so a volunteer can only ever read/write
// the file of a cert they own. Module-gated on 'compliance' like the hr route.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'

// Same private bucket + limits as the hr route (conventions §9: private by
// default, access via short-lived signed URLs).
const CERT_BUCKET = 'certifications'
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
// storage layer too: <companyId>/<certId>/<filename> (identical to the hr route,
// so a file attached by either path lives in the same place).
function buildObjectPath(companyId: string, certId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${companyId}/${certId}/${safe}`
}

// Resolve the caller's OWN certification by id, or null. Scoped by company AND
// employee so another tenant's / another person's cert is invisible (-> 404).
async function findOwnCert(
  ctx: AuthContext,
  id: string,
): Promise<{ id: string; file_url: string | null } | null> {
  if (!ctx.employee) return null
  const { data, error } = await supabaseAdmin
    .from('ess_certifications')
    .select('id, file_url')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('employee_id', ctx.employee.id)
    .single()
  if (error || !data) return null
  return data as { id: string; file_url: string | null }
}

export const GET = withAuth(async (_request: NextRequest, ctx: AuthContext, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

  const moduleErr = await ensureModule(ctx.companyId)
  if (moduleErr) return moduleErr

  const cert = await findOwnCert(ctx, id)
  if (!cert) return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
  if (!cert.file_url) return NextResponse.json({ error: 'No file attached' }, { status: 404 })

  // file_url stores the object PATH within the private bucket (not a public URL).
  const { data, error } = await supabaseAdmin.storage
    .from(CERT_BUCKET)
    .createSignedUrl(cert.file_url, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    console.error('Self cert signed URL error:', error)
    return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, expires_in: SIGNED_URL_TTL_SECONDS })
})

export const POST = withAuth(async (request: NextRequest, ctx: AuthContext, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

  const moduleErr = await ensureModule(ctx.companyId)
  if (moduleErr) return moduleErr

  const cert = await findOwnCert(ctx, id)
  if (!cert) return NextResponse.json({ error: 'Certification not found' }, { status: 404 })

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!formData || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File size must be under 20MB' }, { status: 400 })
  }

  const objectPath = buildObjectPath(ctx.companyId, cert.id, file.name || 'evidence')
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
      console.error('Self cert file upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('ess_certifications')
    .update({ file_url: objectPath, file_name: file.name, updated_at: new Date().toISOString() })
    .eq('id', cert.id)
    .eq('company_id', ctx.companyId)
    .select()
    .single()
  if (updateErr || !updated) {
    console.error('Self cert file_url update error:', updateErr)
    return NextResponse.json({ error: 'File uploaded but record update failed' }, { status: 500 })
  }

  await recordAudit({
    companyId: ctx.companyId,
    actorId: ctx.appUser.id,
    action: 'certification.file_uploaded',
    target: { type: 'certification', id: cert.id },
    meta: { self: true },
  })

  return NextResponse.json({ certification: updated, file_name: file.name }, { status: 201 })
})
