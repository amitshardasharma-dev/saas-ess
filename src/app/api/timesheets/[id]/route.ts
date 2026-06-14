// src/app/api/timesheets/[id]/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Support both UUID and display_id
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  let query = supabaseAdmin
    .from('ess_timesheets')
    .select(`
      *,
      ess_employees!inner (full_name, employee_no)
    `)
    .eq('company_id', companyId)

  if (isUUID) {
    query = query.eq('id', id)
  } else {
    query = query.eq('display_id', id)
  }

  const { data: timesheet, error } = await query.single()
  if (error || !timesheet) {
    return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
  }

  // Get entries
  const { data: entries } = await supabaseAdmin
    .from('ess_timesheet_entries')
    .select(`
      *,
      ess_projects (name, code)
    `)
    .eq('timesheet_id', timesheet.id)
    .order('entry_date')

  // Get approval chain
  const { data: approvals } = await supabaseAdmin
    .from('ess_timesheet_approval_entries')
    .select(`
      *,
      ess_employees!approver_id (full_name, employee_no)
    `)
    .eq('timesheet_id', timesheet.id)
    .order('level_no')

  const timesheetEmployee = (timesheet as { ess_employees?: { full_name?: string | null; employee_no?: string | null } | null }).ess_employees

  type EntryRow = Record<string, unknown> & {
    ess_projects?: { name: string | null; code: string | null } | null
  }
  type ApprovalRow = Record<string, unknown> & {
    ess_employees?: { full_name: string | null; employee_no: string | null } | null
  }

  return NextResponse.json({
    timesheet: {
      ...timesheet,
      employee_name: timesheetEmployee?.full_name,
      employee_no: timesheetEmployee?.employee_no,
    },
    entries: ((entries || []) as EntryRow[]).map((e) => ({
      ...e,
      project_name: e.ess_projects?.name || null,
    })),
    approvals: ((approvals || []) as ApprovalRow[]).map((a) => ({
      ...a,
      approver_name: a.ess_employees?.full_name || '',
    })),
  })
})

// PUT: Update entries (only for Draft/Revision Requested timesheets)
export const PUT = withAuth(async (request, { employee }, params) => {
  const id = params?.id
  if (!id || !employee) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: timesheet } = await supabaseAdmin
    .from('ess_timesheets')
    .select('id, status, employee_id')
    .eq('id', id)
    .single()

  if (!timesheet) {
    return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
  }

  if (timesheet.employee_id !== employee.id) {
    return NextResponse.json({ error: 'Not your timesheet' }, { status: 403 })
  }

  if (!['Draft', 'Revision Requested'].includes(timesheet.status)) {
    return NextResponse.json({ error: 'Timesheet cannot be edited in current status' }, { status: 400 })
  }

  const body = await request.json()
  const entries: Array<{ entry_date: string; hours: number; project_id?: string; activity_category?: string; description?: string }> = body.entries

  // Delete existing entries and re-insert
  await supabaseAdmin
    .from('ess_timesheet_entries')
    .delete()
    .eq('timesheet_id', timesheet.id)

  if (entries && entries.length > 0) {
    const insertData = entries.map(e => ({
      timesheet_id: timesheet.id,
      entry_date: e.entry_date,
      hours: e.hours,
      project_id: e.project_id || null,
      activity_category: e.activity_category || null,
      description: e.description || null,
    }))

    const { error: entryError } = await supabaseAdmin
      .from('ess_timesheet_entries')
      .insert(insertData)

    if (entryError) throw entryError
  }

  // Recalculate total hours
  const totalHours = (entries || []).reduce((sum, e) => sum + Number(e.hours), 0)

  await supabaseAdmin
    .from('ess_timesheets')
    .update({ total_hours: totalHours, updated_at: new Date().toISOString() })
    .eq('id', timesheet.id)

  return NextResponse.json({ message: 'Timesheet updated', total_hours: totalHours })
})

// POST: Submit timesheet for approval
export const POST = withAuth(async (_request, { companyId, employee }, params) => {
  const id = params?.id
  if (!id || !employee) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: timesheet } = await supabaseAdmin
    .from('ess_timesheets')
    .select('id, status, employee_id, total_hours')
    .eq('id', id)
    .single()

  if (!timesheet) {
    return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
  }

  if (timesheet.employee_id !== employee.id) {
    return NextResponse.json({ error: 'Not your timesheet' }, { status: 403 })
  }

  if (!['Draft', 'Revision Requested'].includes(timesheet.status)) {
    return NextResponse.json({ error: 'Timesheet already submitted' }, { status: 400 })
  }

  if (timesheet.total_hours <= 0) {
    return NextResponse.json({ error: 'Cannot submit empty timesheet' }, { status: 400 })
  }

  // Update status to Submitted
  await supabaseAdmin
    .from('ess_timesheets')
    .update({
      status: 'Submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', timesheet.id)

  // Create approval entries from rules
  const { data: rules } = await supabaseAdmin
    .from('ess_approval_rules')
    .select('*')
    .eq('company_id', companyId)
    .eq('rule_type', 'timesheet')
    .eq('is_active', true)
    .order('level_no')

  // If no timesheet-specific rules, use leave rules as fallback
  const effectiveRules = (rules && rules.length > 0) ? rules : []

  // If still no rules, use reporting manager as single-level approver
  if (effectiveRules.length === 0) {
    if (employee.reports_to) {
      await supabaseAdmin.from('ess_timesheet_approval_entries').insert({
        timesheet_id: timesheet.id,
        level_no: 1,
        approver_id: employee.reports_to,
        status: 'Pending',
      })
    }
  } else {
    for (const rule of effectiveRules) {
      let approverId = rule.specific_approver_id

      if (rule.approver_type === 'reporting_manager') {
        approverId = employee.reports_to
      }

      if (approverId) {
        await supabaseAdmin.from('ess_timesheet_approval_entries').insert({
          timesheet_id: timesheet.id,
          level_no: rule.level_no,
          approver_id: approverId,
          status: 'Pending',
        })
      }
    }
  }

  return NextResponse.json({ message: 'Timesheet submitted for approval' })
})
