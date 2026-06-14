import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

interface DocumentVersionRow {
  id: string
  version_number: number
  file_url: string
  file_name: string
  file_size: number
  uploaded_at: string
  changelog: string | null
}

interface DocumentRow {
  id: string
  company_id: string
  category_id: string | null
  title: string
  description: string | null
  current_version: number
  access_roles: string[] | null
  is_published: boolean
  requires_acknowledgment: boolean
  published_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  ess_document_categories: { name: string } | null
  ess_document_versions: DocumentVersionRow[] | null
}

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
  let filtered = (documents || []) as DocumentRow[]
  if (!manage) {
    filtered = filtered.filter((doc) => {
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

  // Signable = latest version has e-sign fields; signed = current employee has a
  // signed record for the document. Batched (one query each) to avoid N+1.
  const latestVersionIds = filtered
    .map((doc) => (doc.ess_document_versions || []).slice().sort((a, b) => b.version_number - a.version_number)[0]?.id)
    .filter((v): v is string => Boolean(v))
  const signableVersions = new Set<string>()
  if (latestVersionIds.length) {
    const { data: fieldRows } = await supabaseAdmin
      .from('ess_document_fields')
      .select('version_id')
      .in('version_id', latestVersionIds)
    for (const f of (fieldRows || []) as Array<{ version_id: string }>) signableVersions.add(f.version_id)
  }
  const signedDocs = new Set<string>()
  if (employee) {
    const { data: sigRows } = await supabaseAdmin
      .from('ess_signed_documents')
      .select('document_id')
      .eq('company_id', companyId)
      .eq('employee_id', employee.id)
    for (const s of (sigRows || []) as Array<{ document_id: string }>) signedDocs.add(s.document_id)
  }

  const processed = filtered.map((doc) => {
    const versions = doc.ess_document_versions || []
    const latestVersion = versions.sort((a, b) => b.version_number - a.version_number)[0]

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
      signable: latestVersion ? signableVersions.has(latestVersion.id) : false,
      signed: signedDocs.has(doc.id),
    }
  })

  return NextResponse.json({ documents: processed })
})

export const POST = withAuth(async (request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ error: 'No employee record' }, { status: 404 })
  }

  const body = await request.json()

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const { data: doc, error } = await supabaseAdmin
    .from('ess_documents')
    .insert({
      company_id: companyId,
      category_id: body.category_id || null,
      title: body.title.trim(),
      description: body.description || null,
      // In-app authored content (markdown). Rendered inline by the XSS-safe
      // converter at read time; null when the doc is file-only.
      body_markdown: typeof body.body_markdown === 'string' ? body.body_markdown : null,
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
