// src/app/api/platform/tenants/[id]/users/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: appUsers, error } = await supabaseAdmin
    .from('ess_app_users')
    .select(`
      id, role, is_active, is_super_admin, auth_user_id,
      ess_employees (full_name, employee_no, department, email)
    `)
    .eq('company_id', id)

  if (error) throw error

  // Get auth emails
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
  const emailMap = new Map((authUsers?.users || []).map(u => [u.id, u.email]))

  type EmployeeJoin = {
    full_name: string | null
    employee_no: string | null
    department: string | null
    email: string | null
  }
  type AppUserRow = {
    id: string
    role: string
    is_active: boolean
    is_super_admin: boolean
    auth_user_id: string
    ess_employees: EmployeeJoin | EmployeeJoin[] | null
  }

  const users = ((appUsers || []) as unknown as AppUserRow[]).map(u => {
    const employee = Array.isArray(u.ess_employees) ? u.ess_employees[0] : u.ess_employees
    return {
      id: u.id,
      email: emailMap.get(u.auth_user_id) || employee?.email || 'Unknown',
      role: u.role,
      is_active: u.is_active,
      is_super_admin: u.is_super_admin,
      employee_name: employee?.full_name || null,
      employee_no: employee?.employee_no || null,
      department: employee?.department || null,
    }
  })

  return NextResponse.json({ users })
})
