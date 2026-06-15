// src/app/api/training/modules/[id]/route.ts
//
// Single module: GET (with items), PATCH (edit / publish / archive — Staff/Admin),
// DELETE (Staff/Admin). Every id-addressed access re-checks ownership and
// returns 404 (never 403) on a cross-tenant id (conventions §6.1).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { updateModuleSchema } from '@/types/training'

/** Load a module if it belongs to the caller's company, else null. */
async function ownedModule(id: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('ess_training_modules')
    .select('*')
    .eq('id', id)
    .single()
  if (!data || data.company_id !== companyId) return null
  return data
}

export const GET = withAuth(async (_request: NextRequest, { companyId }, params) => {
  const id = params!.id
  const mod = await ownedModule(id, companyId)
  if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: items } = await supabaseAdmin
    .from('ess_training_items')
    .select('*')
    .eq('module_id', id)
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })

  return NextResponse.json({ module: { ...mod, items: items ?? [] } })
})

export const PATCH = withAuth(
  async (request: NextRequest, { companyId, employee }, params) => {
    const id = params!.id
    const mod = await ownedModule(id, companyId)
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = updateModuleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (parsed.data.title !== undefined) patch.title = parsed.data.title
    if (parsed.data.description !== undefined) patch.description = parsed.data.description
    if (parsed.data.status !== undefined) patch.status = parsed.data.status
    if (parsed.data.validity_months !== undefined) patch.validity_months = parsed.data.validity_months

    const { data, error } = await supabaseAdmin
      .from('ess_training_modules')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single()

    if (error) {
      console.error('[training] module update error:', error.message)
      return NextResponse.json({ error: 'Failed to update module' }, { status: 500 })
    }

    if (parsed.data.status) {
      await recordAudit({
        companyId,
        actorId: employee?.id ?? null,
        action: `training.module.${parsed.data.status}`,
        target: { type: 'training_module', id },
      })
    }

    return NextResponse.json({ module: data })
  },
  { minRole: 'hr' }
)

export const DELETE = withAuth(
  async (_request: NextRequest, { companyId }, params) => {
    const id = params!.id
    const mod = await ownedModule(id, companyId)
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { error } = await supabaseAdmin
      .from('ess_training_modules')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('[training] module delete error:', error.message)
      return NextResponse.json({ error: 'Failed to delete module' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  },
  { minRole: 'hr' }
)
