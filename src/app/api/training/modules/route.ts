// src/app/api/training/modules/route.ts
//
// Training modules collection. GET (list, manage|catalog), POST (create — Staff/
// Admin via minRole 'hr'). Tenant-scoped; module-gated on 'training'.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { createModuleSchema } from '@/types/training'

export const GET = withAuth(async (request: NextRequest, { companyId }) => {
  try {
    await assertModuleEnabled(companyId, 'training')
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw e
  }

  const { searchParams } = new URL(request.url)
  const manage = searchParams.get('manage') === 'true'

  let query = supabaseAdmin
    .from('ess_training_modules')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  // Non-managers only ever see published modules.
  if (!manage) query = query.eq('status', 'published')

  const { data, error } = await query
  if (error) {
    console.error('[training] modules list error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch modules' }, { status: 500 })
  }
  return NextResponse.json({ modules: data ?? [] })
})

export const POST = withAuth(
  async (request: NextRequest, { companyId, employee }) => {
    try {
      await assertModuleEnabled(companyId, 'training')
    } catch (e) {
      if (e instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
      }
      throw e
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = createModuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('ess_training_modules')
      .insert({
        company_id: companyId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        validity_months: parsed.data.validity_months ?? null,
        status: 'draft',
        created_by: employee?.id ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[training] module create error:', error.message)
      return NextResponse.json({ error: 'Failed to create module' }, { status: 500 })
    }

    await recordAudit({
      companyId,
      actorId: employee?.id ?? null,
      action: 'training.module.created',
      target: { type: 'training_module', id: data.id },
      meta: { title: data.title },
    })

    return NextResponse.json({ module: data }, { status: 201 })
  },
  { minRole: 'hr' }
)
