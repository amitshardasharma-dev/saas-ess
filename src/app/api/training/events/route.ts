// src/app/api/training/events/route.ts
//
// Per-volunteer training event history (feeds Phase 7 reporting + the learner's
// own activity view).
//   GET /api/training/events?scope=&employee_id=&module_id=
//     scope = 'my'  (default) -> the caller's own events
//     scope = 'all'           -> all employees' events (Staff/Admin only)

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { hasMinRole } from '@/types/roles'

export const GET = withAuth(async (request: NextRequest, { companyId, employee, role }) => {
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') ?? 'my'
  const employeeIdParam = searchParams.get('employee_id')
  const moduleIdParam = searchParams.get('module_id')
  const limit = Math.min(Number(searchParams.get('limit') ?? 200), 500)

  let query = supabaseAdmin
    .from('ess_training_events')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (scope === 'all') {
    if (!hasMinRole(role, 'hr')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (employeeIdParam) query = query.eq('employee_id', employeeIdParam)
  } else {
    if (!employee) return NextResponse.json({ events: [] })
    query = query.eq('employee_id', employee.id)
  }

  if (moduleIdParam) query = query.eq('module_id', moduleIdParam)

  const { data, error } = await query
  if (error) {
    console.error('[training] events read error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
  return NextResponse.json({ events: data ?? [] })
})
