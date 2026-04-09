// src/app/api/platform/announcements/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async () => {
  const { data: announcements, error } = await supabaseAdmin
    .from('ess_announcements')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return NextResponse.json({ announcements: announcements || [] })
})

export const POST = withSuperAdmin(async (request: NextRequest) => {
  const body = await request.json()
  const {
    title, message, type, link_url, link_text,
    target_type, target_ids, starts_at, expires_at, is_active,
  } = body

  if (!title || !message || !type) {
    return NextResponse.json(
      { error: 'title, message, and type are required' },
      { status: 400 }
    )
  }

  if (!['info', 'warning', 'critical'].includes(type)) {
    return NextResponse.json({ error: 'type must be info, warning, or critical' }, { status: 400 })
  }

  const targetType = target_type || 'all'
  if (!['all', 'specific_tenants', 'specific_plans'].includes(targetType)) {
    return NextResponse.json(
      { error: 'target_type must be all, specific_tenants, or specific_plans' },
      { status: 400 }
    )
  }

  const { data: announcement, error } = await supabaseAdmin
    .from('ess_announcements')
    .insert({
      title,
      message,
      type,
      link_url: link_url || null,
      link_text: link_text || null,
      target_type: targetType,
      target_ids: target_ids || [],
      starts_at: starts_at || new Date().toISOString(),
      expires_at: expires_at || null,
      is_active: is_active !== undefined ? is_active : true,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ announcement }, { status: 201 })
})
