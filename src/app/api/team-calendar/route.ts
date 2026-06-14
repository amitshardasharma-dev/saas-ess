// src/app/api/team-calendar/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (request, { employee }) => {
  if (!employee) {
    return NextResponse.json({ leaves: [] })
  }

  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()))
  const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1))

  // Get direct reports
  const { data: reports } = await supabaseAdmin
    .from('ess_employees')
    .select('id, full_name, employee_no')
    .eq('reports_to', employee.id)

  if (!reports || reports.length === 0) {
    return NextResponse.json({ leaves: [], employees: [] })
  }

  const reportIds = reports.map(r => r.id)

  // Calculate month date range
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

  // Get leave applications overlapping this month
  const { data: leaves, error } = await supabaseAdmin
    .from('ess_leave_applications')
    .select(`
      id, display_id, employee_id, from_date, till_date, total_days, half_day, status,
      ess_leave_types!inner (name, code)
    `)
    .in('employee_id', reportIds)
    .in('status', ['Approved', 'Pending Approval'])
    .lte('from_date', monthEnd)
    .gte('till_date', monthStart)

  if (error) throw error

  // Color mapping
  const colors: Record<string, string> = {
    'Annual Leave': '#3b82f6',
    'Sick Leave': '#ef4444',
    'Personal Leave': '#8b5cf6',
    'Maternity Leave': '#ec4899',
    'Paternity Leave': '#06b6d4',
    'Compassionate Leave': '#f59e0b',
    'Study Leave': '#10b981',
    'Emergency Leave': '#f97316',
    'Casual Leave': '#6366f1',
    'Unpaid Leave': '#64748b',
  }

  const employeeMap = new Map(reports.map(r => [r.id, r.full_name]))

  type LeaveRow = {
    id: string
    display_id: string | null
    employee_id: string
    from_date: string
    till_date: string
    total_days: number | string
    half_day: boolean | null
    status: string
    ess_leave_types: { name: string | null; code: string | null } | null
  }

  const processed = ((leaves || []) as unknown as LeaveRow[]).map((l) => ({
    id: l.display_id || l.id,
    employeeId: l.employee_id,
    employeeName: employeeMap.get(l.employee_id) || '',
    leaveType: l.ess_leave_types?.name || '',
    leaveTypeColor: (l.ess_leave_types?.name && colors[l.ess_leave_types.name]) || '#6b7280',
    fromDate: l.from_date,
    toDate: l.till_date,
    totalDays: Number(l.total_days),
    status: l.status,
    halfDay: l.half_day || false,
  }))

  return NextResponse.json({
    leaves: processed,
    employees: reports.map(r => ({ id: r.id, name: r.full_name, employeeNo: r.employee_no })),
    month,
    year,
  })
}, { minRole: 'manager' })
