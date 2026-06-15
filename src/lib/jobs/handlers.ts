// src/lib/jobs/handlers.ts

import type { Job } from '@/lib/jobs/dispatch'
import { refreshComplianceStatus } from '@/lib/compliance/refresh-status'
import { scanReminders } from '@/lib/reminders/scan'
import { scanRecertifications } from '@/lib/recertification/scan'
import { scanExpiredTrainings } from '@/lib/training/recert-scan'

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
	// compliance.refresh-status — recompute cached status for the job's company so
	// valid/expiring/expired transitions happen without user action (runs daily).
	'compliance.refresh-status': async (job: Job) => {
		await refreshComplianceStatus(job.company_id)
	},

	// === PHASE-7 HANDLERS ===
	// reminders.scan — for the job's company, find certs at a configured offset and
	// send/escalate templated expiry reminders (dedupe via ess_reminder_sends).
	'reminders.scan': async (job: Job) => {
		if (!job.company_id) return
		await scanReminders(job.company_id)
	},
	// recert.scan — for the job's company, open recertifications for expired certs,
	// auto-assign the mapped refresher module, and notify the volunteer.
	'recert.scan': async (job: Job) => {
		if (!job.company_id) return
		await scanRecertifications(job.company_id)
	},
	// training.recert-scan — reset completed trainings past their expiry so the
	// same module becomes due again (Compliance Register goes RED) + notify.
	'training.recert-scan': async (job: Job) => {
		if (!job.company_id) return
		await scanExpiredTrainings(job.company_id)
	},
}

/** Look up a handler by job type. Returns undefined if none is registered. */
export function getJobHandler(type: string): JobHandler | undefined {
	return jobHandlers[type]
}
