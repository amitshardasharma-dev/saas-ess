// src/app/api/platform/tenants/[id]/impersonate/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const POST = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Find the tenant's admin user
  const { data: adminUser } = await supabaseAdmin
    .from('ess_app_users')
    .select('auth_user_id')
    .eq('company_id', id)
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!adminUser) {
    return NextResponse.json({ error: 'No admin user found for this tenant' }, { status: 404 })
  }

  // Get admin's email
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(adminUser.auth_user_id)
  if (!authUser?.user?.email) {
    return NextResponse.json({ error: 'Could not resolve admin email' }, { status: 500 })
  }

  // Generate magic link
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  })

  if (linkError || !linkData) {
    return NextResponse.json({ error: `Failed to generate link: ${linkError?.message}` }, { status: 500 })
  }

  return NextResponse.json({
    magic_link: linkData.properties?.action_link || null,
    email: authUser.user.email,
    expires_in: '5 minutes',
  })
})
