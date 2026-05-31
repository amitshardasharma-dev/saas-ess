// src/lib/jobs/handlers.ts

import type { Job } from '@/lib/jobs/dispatch'

/**
 * A job handler receives the claimed job and performs the work. Throwing
 * triggers retry/backoff via markJobFailed in the runner.
 */
export type JobHandler = (job: Job) => Promise<void>

/**
 * Registry mapping a job `type` to its handler.
 *
 * Each phase appends its handlers under its own marker comment below. Do NOT
 * reorder or remove another phase's marker — append only (mirrors the
 * navigation.ts phase-delimited pattern, conventions §4.2).
 */
export const jobHandlers: Record<string, JobHandler> = {
	// === PHASE-3 HANDLERS ===

	// === PHASE-7 HANDLERS ===
}

/** Look up a handler by job type. Returns undefined if none is registered. */
export function getJobHandler(type: string): JobHandler | undefined {
	return jobHandlers[type]
}
