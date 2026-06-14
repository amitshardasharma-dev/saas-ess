import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Get all employees in company
  const { data: employees } = await supabaseAdmin
    .from('ess_employees')
    .select('id, full_name, employee_no, department')
    .eq('company_id', companyId)

  // Get latest version
  const { data: latestVersion } = await supabaseAdmin
    .from('ess_document_versions')
    .select('id, version_number')
    .eq('document_id', id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  if (!latestVersion) {
    return NextResponse.json({ employees: [], acknowledged: [], pending: [] })
  }

  // Get acknowledgments for latest version
  const { data: acks } = await supabaseAdmin
    .from('ess_document_acknowledgments')
    .select('employee_id, acknowledged_at')
    .eq('document_id', id)
    .eq('version_id', latestVersion.id)

  const ackSet = new Set((acks || []).map(a => a.employee_id))
  const ackMap = new Map((acks || []).map(a => [a.employee_id, a.acknowledged_at]))

  const allEmployees = (employees || []).map(emp => ({
    id: emp.id,
    name: emp.full_name,
    employee_no: emp.employee_no,
    department: emp.department,
    acknowledged: ackSet.has(emp.id),
    acknowledged_at: ackMap.get(emp.id) || null,
  }))

  return NextResponse.json({
    version: latestVersion.version_number,
    total: allEmployees.length,
    acknowledged_count: ackSet.size,
    employees: allEmployees,
  })
}, { minRole: 'hr' })
