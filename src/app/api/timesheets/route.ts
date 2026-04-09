// src/app/api/timesheets/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ timesheets: [], summary: null })
  }

  const url = new URL(request.url)
  const teamView = url.searchParams.get('team') === 'true'

  let query = supabaseAdmin
    .from('ess_timesheets')
    .select(`
      id, display_id, employee_id, period_start, period_end,
      status, total_hours, submitted_at, created_at, updated_at,
      ess_employees!inner (full_name, employee_no)
    `)
    .eq('company_id', companyId)
    .order('period_start', { ascending: false })

  if (teamView) {
    // Manager view: get timesheets from direct reports
    const { data: reports } = await supabaseAdmin
      .from('ess_employees')
      .select('id')
      .eq('reports_to', employee.id)

    const reportIds = (reports || []).map(r => r.id)
    if (reportIds.length === 0) {
      return NextResponse.json({ timesheets: [] })
    }
    query = query.in('employee_id', reportIds)
  } else {
    query = query.eq('employee_id', employee.id)
  }

  const { data: timesheets, error } = await query

  if (error) throw error

  const processed = (timesheets || []).map((ts: any) => ({
    id: ts.id,
    display_id: ts.display_id,
    employee_id: ts.employee_id,
    employee_name: ts.ess_employees?.full_name || '',
    employee_no: ts.ess_employees?.employee_no || '',
    period_start: ts.period_start,
    period_end: ts.period_end,
    status: ts.status,
    total_hours: Number(ts.total_hours),
    submitted_at: ts.submitted_at,
    created_at: ts.created_at,
    updated_at: ts.updated_at,
  }))

  return NextResponse.json({ timesheets: processed })
})

export const POST = withAuth(async (request, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ error: 'No employee record' }, { status: 404 })
  }

  const body = await request.json()

  // Generate display ID (unique per company)
  const { count } = await supabaseAdmin
    .from('ess_timesheets')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  const displayId = `TS-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`

  const { data: timesheet, error } = await supabaseAdmin
    .from('ess_timesheets')
    .insert({
      display_id: displayId,
      employee_id: employee.id,
      company_id: companyId,
      period_start: body.period_start,
      period_end: body.period_end,
      status: 'Draft',
      total_hours: 0,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({
    timesheet,
    message: 'Timesheet created',
    display_id: displayId,
  })
})
