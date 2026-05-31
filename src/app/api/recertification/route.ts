// src/app/api/recertification/route.ts
//
// Phase 7 — list recertifications for the tenant (Staff/Admin) and enqueue a scan.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { enqueueJob } from '@/lib/jobs/dispatch'
import { recordAudit } from '@/lib/audit'

export const GET = withAuth(async (_req: NextRequest, { companyId }) => {
  const { data, error } = await supabaseAdmin
    .from('ess_recertifications')
    .select('*')
    .eq('company_id', companyId)
    .order('triggered_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Failed to load recertifications' }, { status: 500 })
  return NextResponse.json({ data })
}, { minRole: 'hr' })

export const POST = withAuth(async (_req: NextRequest, { companyId, appUser }) => {
  const job = await enqueueJob('recert.scan', {}, undefined, companyId)
  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'recert.scan_enqueued',
    target: { type: 'job', id: job.id },
  })
  return NextResponse.json({ data: { jobId: job.id } }, { status: 202 })
}, { minRole: 'hr' })
