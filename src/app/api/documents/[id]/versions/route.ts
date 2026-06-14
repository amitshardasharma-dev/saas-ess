import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const POST = withAuth(async (request, { employee }, params) => {
  const id = params?.id
  if (!id || !employee) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const changelog = formData.get('changelog') as string || null

  if (!file) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }

  // Get current version number
  const { data: doc } = await supabaseAdmin
    .from('ess_documents')
    .select('current_version, company_id')
    .eq('id', id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const newVersion = doc.current_version + 1

  // Upload file to Supabase Storage
  const filePath = `${doc.company_id}/documents/${id}/v${newVersion}/${file.name}`
  const fileBuffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabaseAdmin.storage
    .from('ess-documents')
    .upload(filePath, fileBuffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    // Continue with URL even if storage fails — store path for later
  }

  const { data: publicUrl } = supabaseAdmin.storage
    .from('ess-documents')
    .getPublicUrl(filePath)

  // Create version record
  const { data: version, error: versionError } = await supabaseAdmin
    .from('ess_document_versions')
    .insert({
      document_id: id,
      version_number: newVersion,
      file_url: publicUrl.publicUrl || filePath,
      file_name: file.name,
      file_size: file.size,
      uploaded_by: employee.id,
      changelog,
    })
    .select()
    .single()

  if (versionError) throw versionError

  // Update document current_version
  await supabaseAdmin
    .from('ess_documents')
    .update({ current_version: newVersion, updated_at: new Date().toISOString() })
    .eq('id', id)

  // Delete existing acknowledgments (reset for new version)
  await supabaseAdmin
    .from('ess_document_acknowledgments')
    .delete()
    .eq('document_id', id)

  return NextResponse.json({ version, message: `Version ${newVersion} uploaded` })
}, { minRole: 'hr' })
