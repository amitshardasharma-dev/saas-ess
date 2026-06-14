// /api/compliance/export — CSV compliance report (Staff/Admin = hr+).
// Optional filters: ?status=&cert_type_id=&employee_id=. Headers are resolved
// through the Phase 1 label resolver so tenant renames flow through.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { getLabels } from '@/lib/labels'
import { toCsv, type CsvCell } from '@/lib/export/csv'
import { calcStatus, daysUntil } from '@/lib/compliance/expiry'

export const GET = withAuth(
  async (request: NextRequest, ctx: AuthContext) => {
    const { companyId } = ctx
    try {
      await assertModuleEnabled(companyId, 'compliance')
    } catch (err) {
      if (err instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
      }
      throw err
    }

    const params = new URL(request.url).searchParams
    const statusFilter = params.get('status')
    const certTypeFilter = params.get('cert_type_id')
    const employeeFilter = params.get('employee_id')

    let query = supabaseAdmin
      .from('ess_certifications')
      .select(`
        id, employee_id, cert_type_id, title, completion_date, expiry_date, status,
        ess_employees!ess_certifications_employee_id_fkey ( full_name, employee_no ),
        ess_cert_types ( name )
      `)
      .eq('company_id', companyId)
      .order('expiry_date', { ascending: true })

    if (statusFilter) query = query.eq('status', statusFilter)
    if (certTypeFilter) query = query.eq('cert_type_id', certTypeFilter)
    if (employeeFilter) query = query.eq('employee_id', employeeFilter)

    const { data, error } = await query
    if (error) {
      console.error('Compliance export error:', error)
      return NextResponse.json({ error: 'Failed to build report' }, { status: 500 })
    }

    const labels = await getLabels(companyId)

    const headers: CsvCell[] = [
      labels.person.singular,
      'Employee No',
      labels.certification.singular,
      labels.certification.singular + ' Type',
      'Completion Date',
      'Expiry Date',
      'Status',
      'Days Until Expiry',
    ]

    const rows: CsvCell[][] = (data || []).map((c: Record<string, unknown>) => {
      const emp = c.ess_employees as { full_name?: string; employee_no?: string } | null
      const ctype = c.ess_cert_types as { name?: string } | null
      const expiry = (c.expiry_date as string | null) ?? null
      return [
        emp?.full_name ?? '',
        emp?.employee_no ?? '',
        (c.title as string) ?? '',
        ctype?.name ?? '',
        (c.completion_date as string | null) ?? '',
        expiry ?? '',
        (c.status as string | null) ?? calcStatus(expiry),
        daysUntil(expiry) ?? '',
      ]
    })

    const csv = toCsv(headers, rows)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="compliance-report.csv"',
      },
    })
  },
  { minRole: 'hr' },
)
