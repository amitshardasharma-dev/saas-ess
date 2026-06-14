// src/app/api/portal/home/route.ts
//
// Phase 7 — volunteer portal home aggregation. Returns the caller's training,
// certifications, documents, and unread organizational messages in one payload.
// Any authenticated user. Cross-phase tables are read defensively.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe(table: string, build: (q: any) => any): Promise<Record<string, unknown>[]> {
  try {
    const res = await build(supabaseAdmin.from(table))
    if (res?.error) return []
    return (res?.data ?? []) as Record<string, unknown>[]
  } catch {
    return []
  }
}

export const GET = withAuth(async (_req: NextRequest, { companyId, employee }) => {
  if (!employee) {
    return NextResponse.json({ data: { training: [], certifications: [], documents: [], messages: [] } })
  }
  const employeeId = employee.id

  const [training, certifications, documents, recipients] = await Promise.all([
    safe('ess_training_progress', (q) => q.select('*').eq('company_id', companyId).eq('employee_id', employeeId)),
    safe('ess_certifications', (q) => q.select('*').eq('company_id', companyId).eq('employee_id', employeeId)),
    safe('ess_signed_documents', (q) => q.select('*').eq('company_id', companyId).eq('employee_id', employeeId)),
    safe('ess_message_recipients', (q) =>
      q.select('id, message_id, read_at, dismissed_at').eq('company_id', companyId).eq('employee_id', employeeId).is('dismissed_at', null),
    ),
  ])

  // Resolve message subjects for the inbox preview.
  const messageIds = recipients.map((r) => String(r.message_id))
  let messages: Record<string, unknown>[] = []
  if (messageIds.length > 0) {
    const msgs = await safe('ess_messages', (q) =>
      q.select('id, subject, sent_at').eq('company_id', companyId).in('id', messageIds).eq('status', 'sent'),
    )
    const byId = new Map(msgs.map((m) => [String(m.id), m]))
    messages = recipients
      .map((r) => {
        const m = byId.get(String(r.message_id))
        if (!m) return null
        return { recipient_id: r.id, subject: m.subject, sent_at: m.sent_at, read_at: r.read_at }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }

  return NextResponse.json({
    data: {
      training,
      certifications,
      documents,
      messages,
      counts: {
        training: training.length,
        certifications: certifications.length,
        documents: documents.length,
        unreadMessages: messages.filter((m) => !m.read_at).length,
      },
    },
  })
}, { minRole: 'employee' })
