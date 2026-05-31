// src/app/api/reminders/run/route.ts
//
// Phase 7 — enqueue an immediate reminders.scan for the caller's tenant (Admin).
// The actual work runs in the Phase 0 job runner (/api/cron/run-jobs) which executes
// the 'reminders.scan' handler. This lets Staff trigger a scan without waiting for cron.

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { enqueueJob } from '@/lib/jobs/dispatch'
import { recordAudit } from '@/lib/audit'

export const POST = withAuth(async (_req: NextRequest, { companyId, appUser }) => {
  const job = await enqueueJob('reminders.scan', {}, undefined, companyId)
  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'reminder.scan_enqueued',
    target: { type: 'job', id: job.id },
  })
  return NextResponse.json({ data: { jobId: job.id } }, { status: 202 })
}, { minRole: 'admin' })
