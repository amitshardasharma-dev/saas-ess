// src/app/api/communications/inbox/[id]/route.ts
//
// Phase 7 — mark a delivered message read / dismissed. The [id] is the
// ess_message_recipients row id; ownership is re-checked (must belong to caller's
// employee + tenant) before update — returns 404 on cross-tenant/other-user access.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const PATCH = withAuth(async (req: NextRequest, { companyId, employee }, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: row } = await supabaseAdmin
    .from('ess_message_recipients')
    .select('id, company_id, employee_id')
    .eq('id', id)
    .single()
  if (!row || row.company_id !== companyId || row.employee_id !== employee.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const action = (body as { action?: string }).action
  const patch: Record<string, string> = {}
  const now = new Date().toISOString()
  if (action === 'read') patch.read_at = now
  else if (action === 'dismiss') patch.dismissed_at = now
  else return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const { error } = await supabaseAdmin.from('ess_message_recipients').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json({ data: { id, ...patch } })
}, { minRole: 'employee' })
