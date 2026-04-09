// src/lib/auth-middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { UserRole } from '@/types/roles'
import { hasMinRole } from '@/types/roles'

export interface AuthContext {
  authUser: { id: string; email: string }
  appUser: { id: string; company_id: string; role: UserRole; is_active: boolean }
  employee: {
    id: string
    full_name: string
    employee_no: string
    department: string | null
    designation: string | null
    photo_url: string | null
    reports_to: string | null
    is_approver: boolean
    leave_approval_enabled: number
    expense_approval_enabled: number
    [key: string]: unknown
  } | null
  companyId: string
  role: UserRole
}

type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthContext,
  params?: Record<string, string>
) => Promise<NextResponse>

interface WithAuthOptions {
  /** Minimum role required. Defaults to 'employee' (any authenticated user). */
  minRole?: UserRole
}

/**
 * Wraps an API route handler with authentication and authorization.
 *
 * Usage:
 * ```ts
 * export const GET = withAuth(async (request, { companyId, role, employee }) => {
 *   // your handler — user is already verified
 *   return NextResponse.json({ data: 'ok' })
 * })
 * ```
 */
export function withAuth(handler: AuthenticatedHandler, options: WithAuthOptions = {}) {
  const { minRole = 'employee' } = options

  return async (request: NextRequest, routeContext: { params: Promise<Record<string, string>> }) => {
    try {
      // 1. Extract token
      const authHeader = request.headers.get('Authorization')
      const token = authHeader?.replace('Bearer ', '')

      if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // 2. Verify token with Supabase
      const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (authError || !authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // 3. Get app user (company_id, role)
      const { data: appUser, error: appError } = await supabaseAdmin
        .from('ess_app_users')
        .select('id, company_id, role, is_active')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .single()

      if (appError || !appUser) {
        return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
      }

      // 4. Check role authorization
      const userRole = appUser.role as UserRole
      if (!hasMinRole(userRole, minRole)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }

      // 5. Get employee record
      const { data: employee } = await supabaseAdmin
        .from('ess_employees')
        .select('*')
        .eq('app_user_id', appUser.id)
        .single()

      // 6. Build auth context
      const ctx: AuthContext = {
        authUser: { id: authUser.id, email: authUser.email! },
        appUser: { ...appUser, role: userRole },
        employee,
        companyId: appUser.company_id,
        role: userRole,
      }

      // 7. Resolve route params if present
      const params = routeContext?.params ? await routeContext.params : {}

      return handler(request, ctx, params)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
