import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

/**
 * GET /api/employee/by-user/[userId]
 * [userId] is the employee's EMAIL (legacy natural key). Requires auth and is
 * scoped to the caller's company — a foreign-tenant email resolves to 404 (no
 * existence leak). Previously: unauthenticated + unscoped PII disclosure (IDOR).
 */
export const GET = withAuth(async (_request, { companyId }, params) => {
  const userId = params?.userId
  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }

  const { data: employee, error } = await supabaseAdmin
    .from('ess_employees')
    .select('*')
    .eq('email', userId)
    .eq('company_id', companyId) // tenant scoping: never read across companies
    .single()

  if (error || !employee) {
    return NextResponse.json({ error: 'No employee found for this user' }, { status: 404 })
  }

  return NextResponse.json({
    employee: {
      id: employee.employee_no || employee.id,
      name: employee.full_name,
      mobile_phone_no: employee.phone,
      department: employee.department,
      designation: employee.designation,
      company: '',
      status: employee.status,
      user_id: userId,
    },
  })
})
