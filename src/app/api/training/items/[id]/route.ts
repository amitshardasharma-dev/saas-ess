// src/app/api/training/items/[id]/route.ts
//
// Single training item: PATCH (edit) / DELETE. Staff/Admin only. Ownership is
// re-checked by item company_id (404 on cross-tenant).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { detectVideoProvider } from '@/lib/training'

async function ownedItem(id: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('ess_training_items')
    .select('*')
    .eq('id', id)
    .single()
  if (!data || data.company_id !== companyId) return null
  return data
}

export const PATCH = withAuth(
  async (request: NextRequest, { companyId }, params) => {
    const id = params!.id
    const item = await ownedItem(id, companyId)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (typeof body.title === 'string') patch.title = body.title
    if (typeof body.required === 'boolean') patch.required = body.required
    if (typeof body.video_url === 'string') {
      patch.video_url = body.video_url
      patch.video_provider = detectVideoProvider(body.video_url)
    }
    if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('ess_training_items')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single()

    if (error) {
      console.error('[training] item update error:', error.message)
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
    }
    return NextResponse.json({ item: data })
  },
  { minRole: 'hr' }
)

export const DELETE = withAuth(
  async (_request: NextRequest, { companyId }, params) => {
    const id = params!.id
    const item = await ownedItem(id, companyId)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { error } = await supabaseAdmin
      .from('ess_training_items')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
    if (error) {
      console.error('[training] item delete error:', error.message)
      return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  },
  { minRole: 'hr' }
)
