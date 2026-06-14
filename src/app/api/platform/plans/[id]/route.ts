// src/app/api/platform/plans/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const PUT = withSuperAdmin(async (request: NextRequest, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await request.json()
  const allowed = [
    'name', 'slug', 'max_users', 'max_storage_mb',
    'modules_allowed', 'price_monthly', 'price_yearly',
    'is_active', 'sort_order',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: plan, error } = await supabaseAdmin
    .from('ess_platform_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A plan with that slug already exists' }, { status: 409 })
    }
    throw error
  }

  return NextResponse.json({ plan })
})

export const DELETE = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Check if any tenants are on this plan
  const { data: plan } = await supabaseAdmin
    .from('ess_platform_plans')
    .select('slug')
    .eq('id', id)
    .single()

  if (plan?.slug) {
    const { count } = await supabaseAdmin
      .from('ess_companies')
      .select('*', { count: 'exact', head: true })
      .eq('plan', plan.slug)

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete plan: ${count} tenant(s) are currently on this plan` },
        { status: 409 }
      )
    }
  }

  const { error } = await supabaseAdmin
    .from('ess_platform_plans')
    .delete()
    .eq('id', id)

  if (error) throw error
  return NextResponse.json({ message: 'Plan deleted' })
})
