// src/lib/email/send.ts

import { supabaseAdmin } from '@/lib/supabase-server'
import { recordAudit } from '@/lib/audit'

const DEFAULT_API_URL = 'https://email.relevel.ai/api/emails'

export interface SendEmailOptions {
	to: string | string[]
	subject: string
	html: string
	text?: string
	/** Tenant the email is sent on behalf of — drives from-identity + audit. */
	companyId: string
	replyTo?: string
	cc?: string[]
	bcc?: string[]
	attachments?: { filename: string; content: string; content_type: string }[]
}

export interface SendEmailResult {
	id: string
	status: string
}

/**
 * Send a transactional email through MailRelay (Resend-compatible REST API).
 *
 * - Uses `fetch` with a Bearer token from `MAILRELAY_API_KEY`.
 * - Resolves the per-tenant from-identity/branding from `ess_companies`.
 * - When the key is absent, logs to the console and returns a fake id (no-op
 *   transport) so local/dev/test environments never hit the network.
 * - Every send (real or no-op) is recorded in the audit log
 *   (`action: 'email.sent'`).
 *
 * Throws on a non-2xx MailRelay response, surfacing the status (e.g. 403 domain
 * unverified, 413 attachments too large, 422 suppressed).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
	const recipients = Array.isArray(opts.to) ? opts.to : [opts.to]
	const apiKey = process.env.MAILRELAY_API_KEY
	const apiUrl = process.env.MAILRELAY_API_URL || DEFAULT_API_URL

	// Resolve per-tenant from-identity / branding (best-effort).
	const fromAddress = process.env.EMAIL_FROM_DEFAULT || 'noreply@mail.relevel.ai'
	let fromName = process.env.EMAIL_FROM_NAME_DEFAULT || 'Notifications'
	try {
		const { data: company } = await supabaseAdmin
			.from('ess_companies')
			.select('name')
			.eq('id', opts.companyId)
			.single()
		if (company?.name) fromName = company.name
	} catch {
		// Company lookup is non-fatal — fall back to defaults.
	}

	// No-op console transport when no API key is configured.
	if (!apiKey) {
		const fakeId = `noop_${Date.now()}`
		console.log('[email:noop] would send', { from: fromAddress, to: recipients, subject: opts.subject })
		await recordAudit({
			companyId: opts.companyId,
			action: 'email.sent',
			target: { type: 'email', id: fakeId },
			meta: { to: recipients, subject: opts.subject, status: 'noop', transport: 'noop' },
		})
		return { id: fakeId, status: 'noop' }
	}

	const res = await fetch(apiUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			from: fromAddress,
			from_name: fromName,
			to: recipients,
			subject: opts.subject,
			html: opts.html,
			...(opts.text ? { text: opts.text } : {}),
			...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
			...(opts.cc ? { cc: opts.cc } : {}),
			...(opts.bcc ? { bcc: opts.bcc } : {}),
			...(opts.attachments ? { attachments: opts.attachments } : {}),
		}),
	})

	if (!res.ok) {
		const errBody = await res.text().catch(() => '')
		await recordAudit({
			companyId: opts.companyId,
			action: 'email.failed',
			target: { type: 'email' },
			meta: { to: recipients, subject: opts.subject, status: res.status, error: errBody },
		})
		throw new Error(`MailRelay responded ${res.status}: ${errBody}`)
	}

	const payload = (await res.json().catch(() => ({}))) as { data?: { id?: string; status?: string } }
	const id = payload.data?.id ?? ''
	const status = payload.data?.status ?? 'sent'

	await recordAudit({
		companyId: opts.companyId,
		action: 'email.sent',
		target: { type: 'email', id },
		meta: { to: recipients, subject: opts.subject, status, transport: 'mailrelay' },
	})

	return { id, status }
}
