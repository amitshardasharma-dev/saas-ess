// src/app/api/training/progress/route.ts
//
// Progress read API (Phase 7 reporting consumes this).
//   GET /api/training/progress?scope=&employee_id=&module_id=
//     scope = 'my'  (default) -> the caller's own progress
//     scope = 'all'           -> all employees' progress (Staff/Admin only)
// Always tenant-scoped. Optional employee_id / module_id filters.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { hasMinRole } from '@/types/roles'

export const GET = withAuth(async (request: NextRequest, { companyId, employee, role }) => {
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') ?? 'my'
  const employeeIdParam = searchParams.get('employee_id')
  const moduleIdParam = searchParams.get('module_id')

  let query = supabaseAdmin
    .from('ess_training_progress')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })

  if (scope === 'all') {
    // Reporting / management scope — Staff (hr) and above only.
    if (!hasMinRole(role, 'hr')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    if (employeeIdParam) query = query.eq('employee_id', employeeIdParam)
  } else {
    // 'my' scope — locked to the caller's own employee id.
    if (!employee) return NextResponse.json({ progress: [] })
    query = query.eq('employee_id', employee.id)
  }

  if (moduleIdParam) query = query.eq('module_id', moduleIdParam)

  const { data, error } = await query
  if (error) {
    console.error('[training] progress read error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
  }
  return NextResponse.json({ progress: data ?? [] })
})
