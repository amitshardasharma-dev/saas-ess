// src/app/api/platform/tenants/[id]/labels/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'
import { isTermKey } from '@/lib/labels/defaults'
import { recordAudit } from '@/lib/audit'

/**
 * GET /api/platform/tenants/:id/labels -> { overrides: LabelOverrideRow[] }
 * Raw terminology override rows for a tenant (empty when defaults apply).
 */
export const GET = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('ess_tenant_labels')
    .select('term_key, singular, plural')
    .eq('company_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ overrides: data ?? [] })
})

/**
 * PUT /api/platform/tenants/:id/labels -> upsert one terminology override.
 * Body: { termKey: string, singular: string, plural: string }.
 */
export const PUT = withSuperAdmin(async (request, ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  let body: { termKey?: string; singular?: string; plural?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { termKey, singular, plural } = body
  if (!termKey || !singular || !plural) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (!isTermKey(termKey)) {
    return NextResponse.json({ error: 'Unknown term key' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('ess_tenant_labels').upsert(
    { company_id: id, term_key: termKey, singular, plural, updated_at: new Date().toISOString() },
    { onConflict: 'company_id,term_key' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordAudit({
    companyId: id,
    actorId: ctx.appUser.id,
    action: 'terminology.updated',
    entityType: 'tenant_label',
    entityId: termKey,
    metadata: { termKey, singular, plural },
  })

  return NextResponse.json({ message: 'Terminology updated' })
})
