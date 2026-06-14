// src/lib/super-admin-middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { AuthContext, withAuth } from '@/lib/auth-middleware'

type SuperAdminHandler = (
  request: NextRequest,
  context: AuthContext,
  params?: Record<string, string>
) => Promise<NextResponse>

/**
 * Wraps an API route with super admin authentication.
 * Requires the user to have is_super_admin = true on their app_users record.
 */
export function withSuperAdmin(handler: SuperAdminHandler) {
  return withAuth(async (request, context, params) => {
    // Check is_super_admin flag
    const { data: appUser } = await supabaseAdmin
      .from('ess_app_users')
      .select('is_super_admin')
      .eq('id', context.appUser.id)
      .single()

    if (!appUser?.is_super_admin) {
      return NextResponse.json(
        { error: 'Super admin access required' },
        { status: 403 }
      )
    }

    return handler(request, context, params)
  })
}
