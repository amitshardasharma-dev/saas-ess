// src/app/api/platform/tenants/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'
import { MODULE_IDS, ModuleId } from '@/types/roles'
import { validateModuleSet } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'

export const GET = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: company, error } = await supabaseAdmin
    .from('ess_companies')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !company) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // User count
  const { count: userCount } = await supabaseAdmin
    .from('ess_app_users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', id)
    .eq('is_active', true)

  // Employee count
  const { count: empCount } = await supabaseAdmin
    .from('ess_employees')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', id)
    .eq('status', 'Active')

  const settings = company.settings || {}
  return NextResponse.json({
    tenant: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      plan: company.plan,
      status: company.status,
      max_users: company.max_users,
      max_storage_mb: company.max_storage_mb,
      user_count: userCount || 0,
      employee_count: empCount || 0,
      modules_enabled: settings.modules_enabled || ['leave', 'expense'],
      bc_enabled: company.bc_enabled || false,
      bc_api_url: company.bc_api_url || null,
      bc_company_id: company.bc_company_id || null,
      created_at: company.created_at,
      settings,
    },
  })
})

export const PUT = withSuperAdmin(async (request, ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await request.json()
  const updates: Record<string, any> = {}
  let modulesChanged: ModuleId[] | null = null

  if (body.plan !== undefined) updates.plan = body.plan
  if (body.status !== undefined) updates.status = body.status
  if (body.max_users !== undefined) updates.max_users = body.max_users
  if (body.max_storage_mb !== undefined) updates.max_storage_mb = body.max_storage_mb
  if (body.name !== undefined) updates.name = body.name

  // Handle modules_enabled in settings (with dependency validation)
  if (body.modules_enabled !== undefined) {
    if (!Array.isArray(body.modules_enabled)) {
      return NextResponse.json({ error: 'modules_enabled must be an array' }, { status: 400 })
    }

    const desired = body.modules_enabled.filter(
      (m: string): m is ModuleId => MODULE_IDS.includes(m as ModuleId)
    )

    const { ok, errors } = validateModuleSet(desired)
    if (!ok) {
      return NextResponse.json(
        { error: `Module dependencies not met: ${errors.join('; ')}` },
        { status: 409 }
      )
    }

    const { data: current } = await supabaseAdmin
      .from('ess_companies')
      .select('settings')
      .eq('id', id)
      .single()

    updates.settings = { ...(current?.settings || {}), modules_enabled: desired }
    modulesChanged = desired
  }

  const { error } = await supabaseAdmin
    .from('ess_companies')
    .update(updates)
    .eq('id', id)

  if (error) throw error

  if (modulesChanged) {
    await recordAudit({
      companyId: id,
      actorId: ctx.appUser.id,
      action: 'modules.updated',
      entityType: 'company_settings',
      entityId: id,
      metadata: { modules_enabled: modulesChanged },
    })
  }

  return NextResponse.json({ message: 'Tenant updated' })
})

export const DELETE = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Soft delete — set status to cancelled
  const { error } = await supabaseAdmin
    .from('ess_companies')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (error) throw error
  return NextResponse.json({ message: 'Tenant cancelled' })
})
