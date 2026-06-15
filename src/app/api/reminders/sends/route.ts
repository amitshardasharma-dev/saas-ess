// src/app/api/reminders/sends/route.ts
//
// Phase 7 — recent reminder sends log (ess_reminder_sends), hr+. Read-only history
// so admins can confirm reminders are actually going out: cert type, recipient,
// offset, and when. Tenant-scoped via companyId; newest first, capped.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

interface SendRow {
  id: string
  certification_id: string | null
  employee_id: string
  offset_sent: number
  sent_at: string
  ess_employees?: { full_name: string | null } | null
  ess_certifications?: { ess_cert_types?: { name: string | null } | null } | null
}

export const GET = withAuth(async (req: NextRequest, { companyId }) => {
  const limitParam = Number(new URL(req.url).searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50

  const { data, error } = await supabaseAdmin
    .from('ess_reminder_sends')
    .select(
      'id, certification_id, employee_id, offset_sent, sent_at, ' +
        'ess_employees ( full_name ), ' +
        'ess_certifications ( ess_cert_types ( name ) )',
    )
    .eq('company_id', companyId)
    .order('sent_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: 'Failed to load sends' }, { status: 500 })

  const sends = ((data ?? []) as unknown as SendRow[]).map((s) => ({
    id: s.id,
    certification_id: s.certification_id,
    employee_id: s.employee_id,
    offset_sent: s.offset_sent,
    sent_at: s.sent_at,
    recipient_name: s.ess_employees?.full_name ?? null,
    cert_name: s.ess_certifications?.ess_cert_types?.name ?? null,
  }))

  return NextResponse.json({ data: sends })
}, { minRole: 'hr' })
