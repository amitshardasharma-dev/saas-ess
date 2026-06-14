// src/app/api/platform/plans/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'
import { withAuth } from '@/lib/auth-middleware'

// GET — public to authenticated users (needed by tenant creation forms etc.)
export const GET = withAuth(async () => {
  const { data: plans, error } = await supabaseAdmin
    .from('ess_platform_plans')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return NextResponse.json({ plans: plans || [] })
})

// POST — super admin only
export const POST = withSuperAdmin(async (request: NextRequest) => {
  const body = await request.json()
  const {
    name, slug, max_users, max_storage_mb,
    modules_allowed, price_monthly, price_yearly,
    is_active, sort_order,
  } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 })
  }

  const { data: plan, error } = await supabaseAdmin
    .from('ess_platform_plans')
    .insert({
      name,
      slug,
      max_users: max_users ?? 10,
      max_storage_mb: max_storage_mb ?? 1000,
      modules_allowed: modules_allowed ?? [],
      price_monthly: price_monthly ?? 0,
      price_yearly: price_yearly ?? 0,
      is_active: is_active ?? true,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A plan with that slug already exists' }, { status: 409 })
    }
    throw error
  }

  return NextResponse.json({ plan }, { status: 201 })
})
