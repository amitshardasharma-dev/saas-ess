// src/app/api/training/modules/[id]/items/route.ts
//
// Items within a module. POST adds an item (video / document / quiz), PUT
// reorders. Staff/Admin only. The module id is re-checked for ownership.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { createItemSchema, reorderItemsSchema } from '@/types/training'
import { detectVideoProvider } from '@/lib/training'

async function ownedModule(id: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('ess_training_modules')
    .select('id, company_id')
    .eq('id', id)
    .single()
  if (!data || data.company_id !== companyId) return null
  return data
}

export const POST = withAuth(
  async (request: NextRequest, { companyId, employee }, params) => {
    const moduleId = params!.id
    const mod = await ownedModule(moduleId, companyId)
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = createItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const input = parsed.data

    // For document items, verify the referenced document belongs to this tenant.
    if (input.type === 'document' && input.document_id) {
      const { data: doc } = await supabaseAdmin
        .from('ess_documents')
        .select('id, company_id')
        .eq('id', input.document_id)
        .single()
      if (!doc || doc.company_id !== companyId) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
    }

    // Determine next sort_order if not supplied (append to end).
    let sortOrder = input.sort_order
    if (sortOrder === undefined) {
      const { data: last } = await supabaseAdmin
        .from('ess_training_items')
        .select('sort_order')
        .eq('module_id', moduleId)
        .eq('company_id', companyId)
        .order('sort_order', { ascending: false })
        .limit(1)
      sortOrder = last && last.length > 0 ? (last[0].sort_order as number) + 1 : 0
    }

    const videoProvider =
      input.type === 'video' && input.video_url ? detectVideoProvider(input.video_url) : null

    const { data, error } = await supabaseAdmin
      .from('ess_training_items')
      .insert({
        company_id: companyId,
        module_id: moduleId,
        type: input.type,
        title: input.title,
        video_url: input.type === 'video' ? input.video_url ?? null : null,
        video_provider: videoProvider,
        document_id: input.type === 'document' ? input.document_id ?? null : null,
        quiz_id: input.type === 'quiz' ? input.quiz_id ?? null : null,
        required: input.required ?? true,
        sort_order: sortOrder,
      })
      .select()
      .single()

    if (error) {
      console.error('[training] item create error:', error.message)
      return NextResponse.json({ error: 'Failed to add item' }, { status: 500 })
    }

    await recordAudit({
      companyId,
      actorId: employee?.id ?? null,
      action: 'training.item.created',
      target: { type: 'training_item', id: data.id },
      meta: { module_id: moduleId, type: input.type },
    })

    return NextResponse.json({ item: data }, { status: 201 })
  },
  { minRole: 'hr' }
)

export const PUT = withAuth(
  async (request: NextRequest, { companyId }, params) => {
    const moduleId = params!.id
    const mod = await ownedModule(moduleId, companyId)
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = reorderItemsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    // Confirm every id belongs to this module + tenant before reordering.
    const { data: existing } = await supabaseAdmin
      .from('ess_training_items')
      .select('id')
      .eq('module_id', moduleId)
      .eq('company_id', companyId)
    const validIds = new Set((existing ?? []).map((i) => i.id as string))
    if (!parsed.data.item_ids.every((id) => validIds.has(id))) {
      return NextResponse.json({ error: 'Unknown item in order' }, { status: 400 })
    }

    for (let index = 0; index < parsed.data.item_ids.length; index++) {
      await supabaseAdmin
        .from('ess_training_items')
        .update({ sort_order: index })
        .eq('id', parsed.data.item_ids[index])
        .eq('company_id', companyId)
    }

    return NextResponse.json({ ok: true })
  },
  { minRole: 'hr' }
)
