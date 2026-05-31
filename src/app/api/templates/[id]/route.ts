// src/app/api/templates/[id]/route.ts
//
// Phase 7 — delete a reusable template. Ownership re-checked (404 on cross-tenant).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'

export const DELETE = withAuth(async (_req: NextRequest, { companyId, appUser }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: row } = await supabaseAdmin
    .from('ess_message_templates')
    .select('id, company_id')
    .eq('id', id)
    .single()
  if (!row || row.company_id !== companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const { error } = await supabaseAdmin.from('ess_message_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'template.deleted',
    target: { type: 'message_template', id },
  })
  return NextResponse.json({ data: { id } })
}, { minRole: 'hr' })
