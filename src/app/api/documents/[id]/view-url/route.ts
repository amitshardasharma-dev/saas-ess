// GET /api/documents/[id]/view-url?versionId=<opt> -> { url }
// Mints a short-lived signed URL for a document version's source file so the
// portal can embed it inline. Company-scoped via the parent document (the file
// is never exposed publicly without an auth check here).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { storagePathFromUrl, SOURCE_DOCUMENTS_BUCKET } from '@/services/esign'

const TTL_SECONDS = 300

export const GET = withAuth(async (request: NextRequest, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Document must belong to the caller's company.
  const { data: doc } = await supabaseAdmin
    .from('ess_documents')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const versionId = new URL(request.url).searchParams.get('versionId')
  let q = supabaseAdmin
    .from('ess_document_versions')
    .select('id, file_url')
    .eq('document_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
  if (versionId) q = supabaseAdmin.from('ess_document_versions').select('id, file_url').eq('id', versionId).eq('document_id', id).limit(1)

  const { data: rows } = await q
  const version = (rows || [])[0]
  if (!version?.file_url) return NextResponse.json({ error: 'No file' }, { status: 404 })

  const path = storagePathFromUrl(version.file_url as string, SOURCE_DOCUMENTS_BUCKET)
  const { data: signed, error } = await supabaseAdmin.storage
    .from(SOURCE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, TTL_SECONDS)
  if (error || !signed?.signedUrl) {
    // Fall back to the stored URL if it's already a usable absolute URL.
    if (/^https?:\/\//.test(version.file_url as string)) return NextResponse.json({ url: version.file_url })
    return NextResponse.json({ error: 'Could not create view URL' }, { status: 500 })
  }
  return NextResponse.json({ url: signed.signedUrl })
})
