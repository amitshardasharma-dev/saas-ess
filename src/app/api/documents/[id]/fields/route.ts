import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { DefineFieldsSchema } from '@/types/esign'
import { defineFields, listFields, getVersionForCompany } from '@/services/esign'

/**
 * GET /api/documents/[id]/fields?versionId=
 * List fillable fields for a document version. Any authenticated member of the
 * company may read. `id` is the document id; the version must belong to it.
 */
export const GET = withAuth(async (request, { companyId }, params) => {
  const documentId = params?.id
  if (!documentId) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  try {
    await assertModuleEnabled(companyId, 'documents_esign')
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }

  const versionId = await resolveVersionId(request.url, documentId, companyId)
  if (!versionId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ctx = await getVersionForCompany(companyId, versionId)
  if (!ctx || ctx.documentId !== documentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const fields = await listFields(companyId, versionId)
  return NextResponse.json({ fields })
})

/**
 * POST /api/documents/[id]/fields  (hr+)
 * Replace the field set for a version. Body: { versionId, fields[] }.
 */
export const POST = withAuth(
  async (request, { companyId, appUser }, params) => {
    const documentId = params?.id
    if (!documentId) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    try {
      await assertModuleEnabled(companyId, 'documents_esign')
    } catch (err) {
      if (err instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      throw err
    }

    const body = await request.json()
    const parsed = DefineFieldsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    // Version must belong to caller's company AND to this document (else 404).
    const ctx = await getVersionForCompany(companyId, parsed.data.versionId)
    if (!ctx || ctx.documentId !== documentId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const fields = await defineFields(companyId, appUser.id, ctx, parsed.data.fields)
    return NextResponse.json({ fields, message: 'Fields saved' }, { status: 201 })
  },
  { minRole: 'hr' }
)

/**
 * Resolve a version id: prefer an explicit ?versionId= (validated against the
 * document), otherwise the latest version of the document.
 */
async function resolveVersionId(
  reqUrl: string,
  documentId: string,
  companyId: string
): Promise<string | null> {
  const url = new URL(reqUrl)
  const explicit = url.searchParams.get('versionId')
  if (explicit) {
    const ctx = await getVersionForCompany(companyId, explicit)
    return ctx && ctx.documentId === documentId ? explicit : null
  }
  // Confirm the document belongs to the company before exposing its versions.
  const { data: doc } = await supabaseAdmin
    .from('ess_documents')
    .select('id')
    .eq('id', documentId)
    .eq('company_id', companyId)
    .single()
  if (!doc) return null
  const { data: latest } = await supabaseAdmin
    .from('ess_document_versions')
    .select('id')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()
  return latest?.id ?? null
}
