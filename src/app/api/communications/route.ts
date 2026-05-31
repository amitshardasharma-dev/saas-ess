// src/app/api/communications/route.ts
//
// Phase 7 — list + compose internal messages. Staff/Admin (minRole 'hr') may send;
// targeted delivery resolves recipients and writes ess_message_recipients. Optional
// email fan-out via Phase 0 sendEmail. Audited.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email/send'
import { composeMessageSchema } from '@/types/communications'
import { resolveRecipients, supabasePort } from '@/lib/communications/resolve-recipients'

export const GET = withAuth(async (_req: NextRequest, { companyId }) => {
  const { data, error } = await supabaseAdmin
    .from('ess_messages')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  return NextResponse.json({ data })
}, { minRole: 'hr' })

export const POST = withAuth(async (req: NextRequest, { companyId, appUser }) => {
  const body = await req.json().catch(() => null)
  const parsed = composeMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { subject, body_html, targets, send_email, draft } = parsed.data

  // Create the message row.
  const status = draft ? 'draft' : 'sent'
  const { data: msg, error: msgErr } = await supabaseAdmin
    .from('ess_messages')
    .insert({
      company_id: companyId,
      subject,
      body_html,
      sender_app_user_id: appUser.id,
      status,
      sent_at: draft ? null : new Date().toISOString(),
    })
    .select('*')
    .single()
  if (msgErr || !msg) return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })

  // Persist targets.
  if (targets.length > 0) {
    await supabaseAdmin.from('ess_message_targets').insert(
      targets.map((t) => ({ message_id: msg.id, target_type: t.target_type, target_value: t.target_value ?? null })),
    )
  }

  let recipientCount = 0
  if (!draft) {
    const employeeIds = await resolveRecipients(supabasePort(supabaseAdmin), companyId, targets)
    if (employeeIds.length > 0) {
      await supabaseAdmin.from('ess_message_recipients').insert(
        employeeIds.map((employee_id) => ({ company_id: companyId, message_id: msg.id, employee_id })),
      )
      recipientCount = employeeIds.length

      if (send_email) {
        // Best-effort email fan-out. Resolve emails via app_users.
        const { data: emps } = await supabaseAdmin
          .from('ess_employees')
          .select('id, app_user_id')
          .in('id', employeeIds)
        const appUserIds = (emps ?? [])
          .map((e) => (e as { app_user_id?: string | null }).app_user_id)
          .filter((x): x is string => !!x)
        if (appUserIds.length > 0) {
          const { data: users } = await supabaseAdmin
            .from('ess_app_users')
            .select('email')
            .in('id', appUserIds)
          const emails = (users ?? []).map((u) => (u as { email?: string }).email).filter((x): x is string => !!x)
          if (emails.length > 0) {
            try {
              await sendEmail({ to: emails, subject, html: body_html, companyId })
            } catch {
              // Email transport failure must not fail the in-portal delivery.
            }
          }
        }
      }
    }
  }

  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: draft ? 'message.drafted' : 'message.sent',
    target: { type: 'message', id: msg.id },
    meta: { subject, targets, recipientCount, emailed: !!send_email },
  })

  return NextResponse.json({ data: { ...msg, recipientCount } }, { status: 201 })
}, { minRole: 'hr' })
