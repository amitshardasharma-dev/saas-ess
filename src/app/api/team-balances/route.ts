// src/app/api/team-balances/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ members: [] })
  }

  // Get direct reports
  const { data: reports } = await supabaseAdmin
    .from('ess_employees')
    .select('id, full_name, employee_no, department')
    .eq('reports_to', employee.id)

  if (!reports || reports.length === 0) {
    return NextResponse.json({ members: [] })
  }

  const reportIds = reports.map(r => r.id)
  const currentYear = new Date().getFullYear()

  // Get leave types for company
  const { data: leaveTypes } = await supabaseAdmin
    .from('ess_leave_types')
    .select('id, name, eligible_days')
    .eq('company_id', companyId)

  // Get approved leave applications for current year
  const { data: leaveApps } = await supabaseAdmin
    .from('ess_leave_applications')
    .select('employee_id, leave_type_id, total_days')
    .in('employee_id', reportIds)
    .eq('status', 'Approved')
    .gte('from_date', `${currentYear}-01-01`)
    .lte('from_date', `${currentYear}-12-31`)

  // Build balance per employee
  const members = reports.map(emp => {
    const balances = (leaveTypes || [])
      .filter(lt => (lt.eligible_days || 0) > 0)
      .map(lt => {
        const taken = (leaveApps || [])
          .filter(a => a.employee_id === emp.id && a.leave_type_id === lt.id)
          .reduce((sum, a) => sum + Number(a.total_days), 0)

        return {
          leaveType: lt.name,
          allocated: lt.eligible_days || 0,
          taken,
          remaining: Math.max(0, (lt.eligible_days || 0) - taken),
        }
      })

    return {
      employeeId: emp.id,
      employeeName: emp.full_name,
      employeeNo: emp.employee_no,
      department: emp.department,
      balances,
    }
  })

  return NextResponse.json({ members })
}, { minRole: 'manager' })
