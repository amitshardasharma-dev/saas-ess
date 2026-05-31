// src/app/api/reminders/[id]/route.ts
//
// Phase 7 — update / delete a reminder config. Ownership re-checked (404 cross-tenant).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { reminderConfigSchema } from '@/types/reminders'

async function ownedConfig(id: string, companyId: string) {
  const { data: row } = await supabaseAdmin
    .from('ess_reminder_configs')
    .select('id, company_id')
    .eq('id', id)
    .single()
  if (!row || row.company_id !== companyId) return null
  return row
}

export const PATCH = withAuth(async (req: NextRequest, { companyId, appUser }, params) => {
  const id = params?.id
  if (!id || !(await ownedConfig(id, companyId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const parsed = reminderConfigSchema.partial().safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('ess_reminder_configs')
    .update(parsed.data)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'reminder_config.updated',
    target: { type: 'reminder_config', id },
  })
  return NextResponse.json({ data })
}, { minRole: 'admin' })

export const DELETE = withAuth(async (_req: NextRequest, { companyId, appUser }, params) => {
  const id = params?.id
  if (!id || !(await ownedConfig(id, companyId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { error } = await supabaseAdmin.from('ess_reminder_configs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'reminder_config.deleted',
    target: { type: 'reminder_config', id },
  })
  return NextResponse.json({ data: { id } })
}, { minRole: 'admin' })
