// src/app/api/communications/inbox/route.ts
//
// Phase 7 — the in-portal inbox for the current user. Returns messages delivered to
// the caller's employee record (any authenticated user). Mark-read / dismiss is via
// PATCH on /api/communications/inbox/[id].

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_req: NextRequest, { companyId, employee }) => {
  if (!employee) return NextResponse.json({ data: [] })

  const { data: recipients, error } = await supabaseAdmin
    .from('ess_message_recipients')
    .select('id, message_id, read_at, dismissed_at')
    .eq('company_id', companyId)
    .eq('employee_id', employee.id)
    .is('dismissed_at', null)
  if (error) return NextResponse.json({ error: 'Failed to load inbox' }, { status: 500 })

  const messageIds = (recipients ?? []).map((r) => r.message_id)
  if (messageIds.length === 0) return NextResponse.json({ data: [] })

  const { data: messages } = await supabaseAdmin
    .from('ess_messages')
    .select('id, subject, body_html, sent_at')
    .eq('company_id', companyId)
    .in('id', messageIds)
    .eq('status', 'sent')

  const byId = new Map((messages ?? []).map((m) => [m.id, m]))
  const inbox = (recipients ?? [])
    .map((r) => {
      const m = byId.get(r.message_id)
      if (!m) return null
      return {
        recipient_id: r.id,
        message_id: r.message_id,
        subject: m.subject,
        body_html: m.body_html,
        sent_at: m.sent_at,
        read_at: r.read_at,
        dismissed_at: r.dismissed_at,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''))

  return NextResponse.json({ data: inbox })
}, { minRole: 'employee' })
