// src/app/api/timesheets/[id]/entries/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId, employee }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // IDOR fix: verify the timesheet belongs to the caller's company AND that the
  // caller owns it or is an approver, before exposing its entries. Cross-tenant
  // (or unrelated) ids return 404 (don't reveal existence).
  const { data: timesheet } = await supabaseAdmin
    .from('ess_timesheets')
    .select('id, company_id, employee_id')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (!timesheet) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isOwner = !!employee && timesheet.employee_id === employee.id
  const isApprover = !!employee && employee.is_approver === true
  if (!isOwner && !isApprover) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: entries, error } = await supabaseAdmin
    .from('ess_timesheet_entries')
    .select(`
      *,
      ess_projects (name, code)
    `)
    .eq('timesheet_id', id)
    .order('entry_date')

  if (error) throw error

  return NextResponse.json({
    entries: (entries || []).map((e: { ess_projects?: { name?: string } | null } & Record<string, unknown>) => ({
      ...e,
      project_name: e.ess_projects?.name || null,
    })),
  })
})
