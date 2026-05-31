// src/lib/audit.ts

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface RecordAuditParams {
	/** Tenant the action belongs to; null for platform-level events. */
	companyId?: string | null
	/** The actor (app_user id) who performed the action, if any. */
	actorId?: string | null
	/** Dotted action name, e.g. 'tenant.created', 'email.sent'. */
	action: string
	/** What was acted upon, e.g. { type: 'company', id: '...' }. */
	target?: { type?: string | null; id?: string | null }
	/** Arbitrary structured context. */
	meta?: Record<string, unknown>
}

/**
 * Append a row to the audit log (`ess_audit_log`).
 *
 * Best-effort: a failure to write the audit row must never break the caller's
 * primary action, so errors are swallowed and logged to the console.
 */
export async function recordAudit(params: RecordAuditParams): Promise<void> {
	try {
		const { error } = await supabaseAdmin.from('ess_audit_log').insert({
			company_id: params.companyId ?? null,
			actor_app_user_id: params.actorId ?? null,
			action: params.action,
			target_type: params.target?.type ?? null,
			target_id: params.target?.id ?? null,
			meta: params.meta ?? {},
		})
		if (error) {
			console.error('[audit] failed to record', params.action, error.message)
		}
	} catch (err) {
		console.error('[audit] unexpected error recording', params.action, err)
	}
}
