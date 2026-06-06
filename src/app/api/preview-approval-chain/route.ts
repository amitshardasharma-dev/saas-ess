import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/preview-approval-chain?employee=<id|employee_no>&leave_type=&total_days=
 * Requires auth. The employee is resolved with PARAMETERIZED .eq() filters scoped
 * to the caller's company — no string-interpolated .or() (kills the filter-injection
 * vector) and a foreign-tenant employee resolves to 404 (no cross-tenant disclosure).
 */
export const GET = withAuth(async (request, { companyId }) => {
  const { searchParams } = new URL(request.url)
  const employee = searchParams.get('employee')
  const leaveType = searchParams.get('leave_type')
  const totalDays = searchParams.get('total_days')

  if (!employee || !leaveType || !totalDays) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  // Resolve by employee_no (safe string eq), then by uuid id — both scoped to the
  // caller's company. No raw interpolation into a PostgREST filter string.
  let emp: { id: string; company_id: string; reports_to: string | null } | null = null
  {
    const { data } = await supabaseAdmin
      .from('ess_employees')
      .select('id, company_id, reports_to')
      .eq('employee_no', employee)
      .eq('company_id', companyId)
      .maybeSingle()
    emp = data
  }
  if (!emp && UUID_RE.test(employee)) {
    const { data } = await supabaseAdmin
      .from('ess_employees')
      .select('id, company_id, reports_to')
      .eq('id', employee)
      .eq('company_id', companyId)
      .maybeSingle()
    emp = data
  }

  if (!emp) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  }

  const { data: rules } = await supabaseAdmin
    .from('ess_approval_rules')
    .select(`
      *,
      specific_approver:ess_employees!ess_approval_rules_specific_approver_id_fkey(id, full_name, employee_no)
    `)
    .eq('company_id', companyId)
    .eq('rule_type', 'leave')
    .eq('is_active', true)
    .order('level_no')

  if (!rules || rules.length === 0) {
    // Default: reporting manager
    let reportsTo: { full_name: string; employee_no: string } | null = null
    if (emp.reports_to) {
      const { data } = await supabaseAdmin
        .from('ess_employees')
        .select('full_name, employee_no')
        .eq('id', emp.reports_to)
        .eq('company_id', companyId)
        .maybeSingle()
      reportsTo = data
    }
    return NextResponse.json({
      approval_chain: [{
        level: 1,
        approver_type: 'reporting_manager',
        approver_name: reportsTo?.full_name || 'Reporting Manager',
        approver_id: reportsTo?.employee_no || '',
      }],
    })
  }

  const chain = await Promise.all(
    rules.map(async (rule) => {
      let approverName = 'Unknown'
      let approverId = ''

      if (rule.approver_type === 'specific' && rule.specific_approver) {
        approverName = (rule.specific_approver as any).full_name
        approverId = (rule.specific_approver as any).employee_no
      } else if (rule.approver_type === 'reporting_manager' && emp.reports_to) {
        const { data: mgr } = await supabaseAdmin
          .from('ess_employees')
          .select('full_name, employee_no')
          .eq('id', emp.reports_to)
          .eq('company_id', companyId)
          .maybeSingle()
        if (mgr) {
          approverName = mgr.full_name
          approverId = mgr.employee_no
        }
      }

      return {
        level: rule.level_no,
        approver_type: rule.approver_type,
        approver_name: approverName,
        approver_id: approverId,
      }
    })
  )

  return NextResponse.json({ approval_chain: chain })
})
