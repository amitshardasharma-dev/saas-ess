// src/app/api/cron/run-jobs/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { claimDueJobs, markJobDone, markJobFailed } from '@/lib/jobs/dispatch'
import { getJobHandler } from '@/lib/jobs/handlers'

/**
 * Cron entry point: claims due jobs and runs their handlers.
 *
 * Guarded by CRON_SECRET. Vercel Cron sends it as `Authorization: Bearer <secret>`;
 * we also accept an `x-cron-secret` header for manual/local invocation.
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

	const jobs = await claimDueJobs(25)
	const results: { id: string; type: string; status: 'done' | 'failed' | 'skipped' }[] = []

	for (const job of jobs) {
		const handler = getJobHandler(job.type)
		if (!handler) {
			await markJobFailed(job, `No handler registered for type "${job.type}"`)
			results.push({ id: job.id, type: job.type, status: 'skipped' })
			continue
		}

		try {
			await handler(job)
			await markJobDone(job.id)
			results.push({ id: job.id, type: job.type, status: 'done' })
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			await markJobFailed(job, message)
			results.push({ id: job.id, type: job.type, status: 'failed' })
		}
	}

	return NextResponse.json({ claimed: jobs.length, results })
}
