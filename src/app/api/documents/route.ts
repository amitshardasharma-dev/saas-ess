import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (request, { companyId, role, employee }) => {
  const url = new URL(request.url)
  const manage = url.searchParams.get('manage') === 'true'

  let query = supabaseAdmin
    .from('ess_documents')
    .select(`
      *,
      ess_document_categories (name),
      ess_document_versions (id, version_number, file_url, file_name, file_size, uploaded_at, changelog)
    `)
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })

  // Staff can only see published documents they have role access to
  if (!manage) {
    query = query.eq('is_published', true)
  }

  const { data: documents, error } = await query
  if (error) throw error

  // Filter by role access (unless HR/admin managing)
  let filtered = documents || []
  if (!manage) {
    filtered = filtered.filter((doc: any) => {
      const accessRoles = doc.access_roles || ['employee', 'manager', 'hr', 'admin']
      return accessRoles.includes(role)
    })
  }

  // Get acknowledgment status for current employee
  // Query acks BEFORE the map so it's in scope; build a map keyed by document_id+version_id
  let acks: Array<{ document_id: string; version_id: string }> = []
  const ackMap: Record<string, boolean> = {} // key: `${document_id}:${version_id}`

  if (employee) {
    const { data: ackData } = await supabaseAdmin
      .from('ess_document_acknowledgments')
      .select('document_id, version_id')
      .eq('employee_id', employee.id)

    acks = ackData || []

    for (const ack of acks) {
      ackMap[`${ack.document_id}:${ack.version_id}`] = true
    }
  }

  const processed = filtered.map((doc: any) => {
    const versions = doc.ess_document_versions || []
    const latestVersion = versions.sort((a: any, b: any) => b.version_number - a.version_number)[0]

    // Check if acknowledged for the latest version specifically
    const acknowledged = employee && latestVersion
      ? !!(ackMap[`${doc.id}:${latestVersion.id}`])
      : false

    return {
      id: doc.id,
      company_id: doc.company_id,
      category_id: doc.category_id,
      category_name: doc.ess_document_categories?.name || 'Uncategorized',
      title: doc.title,
      description: doc.description,
      current_version: doc.current_version,
      access_roles: doc.access_roles,
      is_published: doc.is_published,
      requires_acknowledgment: doc.requires_acknowledgment,
      published_at: doc.published_at,
      created_by: doc.created_by,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      latest_version: latestVersion || null,
      acknowledged,
    }
  })

  return NextResponse.json({ documents: processed })
})

export const POST = withAuth(async (request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ error: 'No employee record' }, { status: 404 })
  }

  const body = await request.json()

  const { data: doc, error } = await supabaseAdmin
    .from('ess_documents')
    .insert({
      company_id: companyId,
      category_id: body.category_id || null,
      title: body.title,
      description: body.description || null,
      access_roles: body.access_roles || ['employee', 'manager', 'hr', 'admin'],
      is_published: false,
      requires_acknowledgment: body.requires_acknowledgment || false,
      created_by: employee.id,
    })
    .select()
    .single()

  if (error) throw error
  return NextResponse.json({ document: doc, message: 'Document created' })
}, { minRole: 'hr' })
