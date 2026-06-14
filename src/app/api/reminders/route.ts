// src/app/api/reminders/route.ts
//
// Phase 7 — list + create expiry reminder configs (ess_reminder_configs). Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { reminderConfigSchema } from '@/types/reminders'

export const GET = withAuth(async (_req: NextRequest, { companyId }) => {
  const { data, error } = await supabaseAdmin
    .from('ess_reminder_configs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Failed to load configs' }, { status: 500 })
  return NextResponse.json({ data })
}, { minRole: 'admin' })

export const POST = withAuth(async (req: NextRequest, { companyId, appUser }) => {
  const parsed = reminderConfigSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('ess_reminder_configs')
    .insert({ company_id: companyId, ...parsed.data })
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: 'Failed to create config' }, { status: 500 })
  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'reminder_config.created',
    target: { type: 'reminder_config', id: data.id },
    meta: { offsets: parsed.data.offsets, frequency: parsed.data.frequency },
  })
  return NextResponse.json({ data }, { status: 201 })
}, { minRole: 'admin' })
