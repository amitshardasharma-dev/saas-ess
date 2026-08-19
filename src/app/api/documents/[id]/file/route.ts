// GET /api/documents/[id]/file?versionId=<opt> -> raw PDF bytes (same-origin).
// The in-browser renderer (react-pdf) fetches the source PDF from here instead of
// the cross-origin Supabase signed URL, so there are no CORS/auth surprises. The
// caller sends the bearer token; company scoping via the parent document.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { storagePathFromUrl, SOURCE_DOCUMENTS_BUCKET } from '@/services/esign'

export const GET = withAuth(async (request: NextRequest, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Document must belong to the caller's company (cross-tenant -> 404).
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
  if (versionId) {
    q = supabaseAdmin.from('ess_document_versions').select('id, file_url').eq('id', versionId).eq('document_id', id).limit(1)
  }
  const { data: rows } = await q
  const version = (rows || [])[0]
  if (!version?.file_url) return NextResponse.json({ error: 'No file' }, { status: 404 })

  const path = storagePathFromUrl(version.file_url as string, SOURCE_DOCUMENTS_BUCKET)
  const { data: blob, error } = await supabaseAdmin.storage.from(SOURCE_DOCUMENTS_BUCKET).download(path)
  if (error || !blob) {
    // Fall back to the stored URL if it's already an absolute, fetchable URL.
    if (/^https?:\/\//.test(version.file_url as string)) {
      const res = await fetch(version.file_url as string)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        return new NextResponse(buf, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=60' } })
      }
    }
    return NextResponse.json({ error: 'Could not load file' }, { status: 500 })
  }

  const buf = Buffer.from(await blob.arrayBuffer())
  return new NextResponse(buf, {
    status: 200,
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=60' },
  })
})
