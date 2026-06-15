// src/app/api/cron/daily-scans/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { enqueueJob } from '@/lib/jobs/dispatch'

/**
 * Daily scan scheduler (spec feature #10 — automated expiry reminders + recert).
 *
 * Runs once a day (Vercel Cron, 18:00 UTC). For every ACTIVE tenant it enqueues a
 * `reminders.scan` and a `recert.scan` job, company-scoped and immediate. The
 * existing `/api/cron/run-jobs` cron (every 5 minutes) then drains the queue and
 * the registered `reminders.scan` / `recert.scan` handlers do the actual work.
 *
 * This is the recurring enqueuer that was missing: previously only manual buttons
 * (reminders/run, recertification) ever enqueued these jobs.
 *
 * Guarded by CRON_SECRET. Vercel Cron sends it as `Authorization: Bearer <secret>`;
 * we also accept an `x-cron-secret` header for manual/local invocation. (Auth mirrors
 * /api/cron/run-jobs.)
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
	const secret = process.env.CRON_SECRET
	if (!secret) {
		return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
	}

	const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
	const headerSecret = req.headers.get('x-cron-secret')
	if (bearer !== secret && headerSecret !== secret) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const { data: companies, error } = await supabaseAdmin
		.from('ess_companies')
		.select('id')
		.eq('status', 'active')

	if (error) {
		return NextResponse.json({ error: `failed to list tenants: ${error.message}` }, { status: 500 })
	}

	const tenants = (companies ?? []) as { id: string }[]
	let enqueued = 0

	for (const tenant of tenants) {
		await enqueueJob('reminders.scan', {}, undefined, tenant.id)
		await enqueueJob('recert.scan', {}, undefined, tenant.id)
		await enqueueJob('training.recert-scan', {}, undefined, tenant.id)
		enqueued += 3
	}

	return NextResponse.json({ tenants: tenants.length, enqueued })
}
