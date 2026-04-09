// src/app/api/platform/announcements/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const PUT = withSuperAdmin(async (request: NextRequest, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await request.json()
  const updates: Record<string, any> = {}

  if (body.title !== undefined) updates.title = body.title
  if (body.message !== undefined) updates.message = body.message
  if (body.type !== undefined) updates.type = body.type
  if (body.link_url !== undefined) updates.link_url = body.link_url
  if (body.link_text !== undefined) updates.link_text = body.link_text
  if (body.target_type !== undefined) updates.target_type = body.target_type
  if (body.target_ids !== undefined) updates.target_ids = body.target_ids
  if (body.starts_at !== undefined) updates.starts_at = body.starts_at
  if (body.expires_at !== undefined) updates.expires_at = body.expires_at
  if (body.is_active !== undefined) updates.is_active = body.is_active

  const { data: announcement, error } = await supabaseAdmin
    .from('ess_announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ announcement })
})

export const DELETE = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('ess_announcements')
    .delete()
    .eq('id', id)

  if (error) throw error

  return NextResponse.json({ message: 'Announcement deleted' })
})
