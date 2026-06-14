// POST /api/documents/[id]/signature-setup  (hr+)
//
// Makes a document "signable": ensures the latest version is a PDF that carries a
// single required signature field, so a volunteer can actually sign it.
//
// Two paths (the body decides):
//   - source: 'file'     -> use the document's latest uploaded version as-is.
//   - source: 'markdown' -> render the document's body_markdown into a simple PDF
//                           (pdf-lib), upload it as a new version, then field it.
//
// Either way we end by defining ONE signature field on the target version via the
// e-sign service. Idempotent: re-running replaces the field set (defineFields is a
// delete+insert). Module-gated on documents_esign, mirroring the fields route.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { defineFields, getVersionForCompany, SOURCE_DOCUMENTS_BUCKET } from '@/services/esign'
import { generateDocumentPdf } from '@/lib/documents/markdown-pdf'
import type { FieldDefinitionInput } from '@/types/esign'

const SIGNATURE_FIELD: FieldDefinitionInput = {
  fieldKey: 'signature',
  label: 'Signature',
  type: 'signature',
  required: true,
  page: 1,
  // Sensible default placement near the reserved signature line on the page.
  xRatio: 0.18,
  yRatio: 0.9,
  widthRatio: 0.4,
  heightRatio: 0.05,
  sortOrder: 0,
}

export const POST = withAuth(
  async (request, { companyId, employee }, params) => {
    const documentId = params?.id
    if (!documentId || !employee) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    try {
      await assertModuleEnabled(companyId, 'documents_esign')
    } catch (err) {
      if (err instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'E-signatures are not enabled for this company' }, { status: 403 })
      }
      throw err
    }

    // Document must belong to the caller's company.
    const { data: doc } = await supabaseAdmin
      .from('ess_documents')
      .select('id, company_id, title, body_markdown, current_version')
      .eq('id', documentId)
      .eq('company_id', companyId)
      .single()
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const source: 'file' | 'markdown' = body?.source === 'markdown' ? 'markdown' : 'file'

    let versionId: string

    if (source === 'markdown') {
      const md = (doc.body_markdown as string | null) ?? ''
      if (!md.trim()) {
        return NextResponse.json(
          { error: 'Cannot generate a signable PDF: this document has no authored content' },
          { status: 400 }
        )
      }
      // 1. Render markdown -> PDF.
      const pdfBytes = await generateDocumentPdf(doc.title as string, md)

      // 2. Upload as the next version (same path scheme as the versions route).
      const newVersion = (doc.current_version as number) + 1
      const fileName = `${slugify(doc.title as string) || 'document'}.pdf`
      const filePath = `${companyId}/documents/${documentId}/v${newVersion}/${fileName}`
      const { error: uploadError } = await supabaseAdmin.storage
        .from(SOURCE_DOCUMENTS_BUCKET)
        .upload(filePath, Buffer.from(pdfBytes), { contentType: 'application/pdf', upsert: true })
      if (uploadError) {
        return NextResponse.json({ error: `Failed to store generated PDF: ${uploadError.message}` }, { status: 500 })
      }
      const { data: publicUrl } = supabaseAdmin.storage.from(SOURCE_DOCUMENTS_BUCKET).getPublicUrl(filePath)

      const { data: version, error: versionError } = await supabaseAdmin
        .from('ess_document_versions')
        .insert({
          document_id: documentId,
          version_number: newVersion,
          file_url: publicUrl.publicUrl || filePath,
          file_name: fileName,
          file_size: pdfBytes.length,
          uploaded_by: employee.id,
          changelog: 'Generated from authored content for signing',
        })
        .select('id')
        .single()
      if (versionError || !version) {
        return NextResponse.json({ error: 'Failed to create version' }, { status: 500 })
      }

      // 3. Bump current_version and reset acks (a new version supersedes them).
      await supabaseAdmin
        .from('ess_documents')
        .update({ current_version: newVersion, updated_at: new Date().toISOString() })
        .eq('id', documentId)
      await supabaseAdmin.from('ess_document_acknowledgments').delete().eq('document_id', documentId)

      versionId = version.id as string
    } else {
      // File path: require an existing uploaded version.
      const { data: latest } = await supabaseAdmin
        .from('ess_document_versions')
        .select('id, file_name')
        .eq('document_id', documentId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single()
      if (!latest) {
        return NextResponse.json(
          { error: 'Upload a PDF first, then enable signing' },
          { status: 400 }
        )
      }
      if (latest.file_name && !/\.pdf$/i.test(latest.file_name as string)) {
        return NextResponse.json(
          { error: 'Signing requires the latest version to be a PDF' },
          { status: 400 }
        )
      }
      versionId = latest.id as string
    }

    // Define the signature field on the target version (tenant-checked).
    const ctx = await getVersionForCompany(companyId, versionId)
    if (!ctx || ctx.documentId !== documentId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await defineFields(companyId, employee.id, ctx, [SIGNATURE_FIELD])

    return NextResponse.json({ message: 'Document is now signable', versionId }, { status: 201 })
  },
  { minRole: 'hr' }
)

/** Lowercase, dash-separated, ascii-only — safe for a storage object name. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
