// src/lib/jobs/dispatch.ts

import { supabaseAdmin } from '@/lib/supabase-admin'

export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Job {
	id: string
	company_id: string | null
	type: string
	payload: Record<string, unknown>
	status: JobStatus
	run_after: string
	attempts: number
	last_error: string | null
	created_at: string
	updated_at: string
}

/**
 * Insert a new job into the queue. `runAfter` defaults to now (eligible
 * immediately). Returns the created job.
 */
export async function enqueueJob(
	type: string,
	payload: Record<string, unknown> = {},
	runAfter?: Date,
	companyId?: string | null,
): Promise<Job> {
	const { data, error } = await supabaseAdmin
		.from('ess_jobs')
		.insert({
			type,
			payload,
			company_id: companyId ?? null,
			run_after: (runAfter ?? new Date()).toISOString(),
		})
		.select()
		.single()

	if (error || !data) {
		throw new Error(`enqueueJob failed: ${error?.message ?? 'no row returned'}`)
	}

	return data as Job
}

/**
 * Claim up to `limit` due jobs (status pending, run_after <= now), marking each
 * `running` and bumping `attempts`. The conditional update acts as a lock so a
 * job is claimed at most once per cron tick (at-least-once overall).
 */
export async function claimDueJobs(limit = 10): Promise<Job[]> {
	const nowIso = new Date().toISOString()

	const { data: candidates, error } = await supabaseAdmin
		.from('ess_jobs')
		.select('*')
		.eq('status', 'pending')
		.lte('run_after', nowIso)
		.order('run_after', { ascending: true })
		.limit(limit)

	if (error) {
		throw new Error(`claimDueJobs failed: ${error.message}`)
	}

	const claimed: Job[] = []
	for (const candidate of (candidates ?? []) as Job[]) {
		const { data: locked } = await supabaseAdmin
			.from('ess_jobs')
			.update({
				status: 'running',
				attempts: candidate.attempts + 1,
				updated_at: nowIso,
			})
			.eq('id', candidate.id)
			.eq('status', 'pending')
			.select()
			.single()

		if (locked) {
			claimed.push(locked as Job)
		}
	}

	return claimed
}

/** Mark a job successfully completed. */
export async function markJobDone(jobId: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from('ess_jobs')
		.update({
			status: 'done',
			last_error: null,
			updated_at: new Date().toISOString(),
		})
		.eq('id', jobId)

	if (error) {
		throw new Error(`markJobDone failed: ${error.message}`)
	}
}

/**
 * Mark a job failed. If attempts remain (< maxAttempts) it is re-queued as
 * `pending` with an exponential backoff; otherwise it stays `failed`.
 */
export async function markJobFailed(
	job: Pick<Job, 'id' | 'attempts'>,
	errorMessage: string,
	maxAttempts = 5,
): Promise<void> {
	const nowIso = new Date().toISOString()
	const exhausted = job.attempts >= maxAttempts

	if (exhausted) {
		const { error } = await supabaseAdmin
			.from('ess_jobs')
			.update({ status: 'failed', last_error: errorMessage, updated_at: nowIso })
			.eq('id', job.id)
		if (error) {
			throw new Error(`markJobFailed failed: ${error.message}`)
		}
		return
	}

	// Exponential backoff: 2^attempts minutes (capped at 60).
	const backoffMinutes = Math.min(2 ** job.attempts, 60)
	const nextRunAfter = new Date(Date.now() + backoffMinutes * 60_000).toISOString()

	const { error } = await supabaseAdmin
		.from('ess_jobs')
		.update({
			status: 'pending',
			last_error: errorMessage,
			run_after: nextRunAfter,
			updated_at: nowIso,
		})
		.eq('id', job.id)

	if (error) {
		throw new Error(`markJobFailed failed: ${error.message}`)
	}
}
