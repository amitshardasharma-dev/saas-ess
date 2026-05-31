// src/app/api/templates/route.ts
//
// Phase 7 — reusable message templates (ess_message_templates). Staff/Admin only.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { templateSchema } from '@/types/communications'

export const GET = withAuth(async (_req: NextRequest, { companyId }) => {
  const { data, error } = await supabaseAdmin
    .from('ess_message_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  return NextResponse.json({ data })
}, { minRole: 'hr' })

export const POST = withAuth(async (req: NextRequest, { companyId, appUser }) => {
  const parsed = templateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('ess_message_templates')
    .insert({ company_id: companyId, ...parsed.data })
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'template.created',
    target: { type: 'message_template', id: data.id },
    meta: { name: parsed.data.name },
  })
  return NextResponse.json({ data }, { status: 201 })
}, { minRole: 'hr' })
