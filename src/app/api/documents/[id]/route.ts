import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId, employee }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: doc, error } = await supabaseAdmin
    .from('ess_documents')
    .select(`
      *,
      ess_document_categories (name)
    `)
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Get all versions
  const { data: versions } = await supabaseAdmin
    .from('ess_document_versions')
    .select('*')
    .eq('document_id', id)
    .order('version_number', { ascending: false })

  // Check if current user acknowledged latest version
  let acknowledged = false
  const latestVersion = (versions || [])[0]
  if (employee && latestVersion) {
    const { data: ack } = await supabaseAdmin
      .from('ess_document_acknowledgments')
      .select('id')
      .eq('document_id', id)
      .eq('version_id', latestVersion.id)
      .eq('employee_id', employee.id)
      .single()
    acknowledged = !!ack
  }

  // Signable = latest version has e-sign fields; signed = current employee signed it.
  let signable = false
  let signed = false
  if (latestVersion) {
    const { count } = await supabaseAdmin
      .from('ess_document_fields')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', latestVersion.id)
    signable = (count ?? 0) > 0
  }
  if (employee) {
    const { data: sig } = await supabaseAdmin
      .from('ess_signed_documents')
      .select('id, signed_at')
      .eq('document_id', id)
      .eq('employee_id', employee.id)
      .order('signed_at', { ascending: false })
      .limit(1)
    signed = !!(sig && sig.length)
  }

  // Track read
  if (employee) {
    await supabaseAdmin
      .from('ess_document_read_tracking')
      .upsert({
        document_id: id,
        employee_id: employee.id,
        last_viewed_at: new Date().toISOString(),
      }, { onConflict: 'document_id,employee_id' })
  }

  return NextResponse.json({
    document: {
      ...doc,
      category_name: (doc as { ess_document_categories?: { name?: string } | null }).ess_document_categories?.name || 'Uncategorized',
    },
    versions: versions || [],
    acknowledged,
    signable,
    signed,
  })
})

export const PUT = withAuth(async (request, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await request.json()

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) updateData.title = body.title
  if (body.description !== undefined) updateData.description = body.description
  if (body.category_id !== undefined) updateData.category_id = body.category_id
  if (body.access_roles !== undefined) updateData.access_roles = body.access_roles
  if (body.requires_acknowledgment !== undefined) updateData.requires_acknowledgment = body.requires_acknowledgment
  if (body.is_published !== undefined) {
    updateData.is_published = body.is_published
    if (body.is_published) updateData.published_at = new Date().toISOString()
  }

  const { error } = await supabaseAdmin
    .from('ess_documents')
    .update(updateData)
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) throw error
  return NextResponse.json({ message: 'Document updated' })
}, { minRole: 'hr' })

export const DELETE = withAuth(async (_request, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('ess_documents')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) throw error
  return NextResponse.json({ message: 'Document deleted' })
}, { minRole: 'hr' })
