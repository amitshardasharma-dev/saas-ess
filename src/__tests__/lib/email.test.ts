// Mock audit + supabase-server before importing the email helper.
jest.mock('@/lib/audit', () => ({
	recordAudit: jest.fn().mockResolvedValue(undefined),
}))

const mockSingle = jest.fn()
jest.mock('@/lib/supabase-server', () => ({
	supabaseAdmin: {
		from: () => ({
			select: () => ({
				eq: () => ({ single: (...args: unknown[]) => mockSingle(...args) }),
			}),
		}),
	},
}))

import { sendEmail } from '@/lib/email/send'

const { recordAudit } = jest.requireMock('@/lib/audit') as { recordAudit: jest.Mock }

describe('sendEmail', () => {
	const realFetch = global.fetch

	beforeEach(() => {
		jest.clearAllMocks()
		mockSingle.mockResolvedValue({ data: { name: 'Birch' }, error: null })
	})

	afterEach(() => {
		global.fetch = realFetch
		delete process.env.MAILRELAY_API_KEY
		delete process.env.MAILRELAY_API_URL
	})

	it('uses the no-op transport and writes an audit row when no API key', async () => {
		delete process.env.MAILRELAY_API_KEY
		const fetchSpy = jest.fn()
		global.fetch = fetchSpy as unknown as typeof fetch

		const result = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>', companyId: 'c1' })

		expect(result.id).toMatch(/^noop_/)
		expect(result.status).toBe('noop')
		expect(fetchSpy).not.toHaveBeenCalled()
		expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'email.sent' }))
	})

	it('POSTs to MailRelay with Bearer auth and returns id/status', async () => {
		process.env.MAILRELAY_API_KEY = 'sk_live_test'
		const fetchSpy = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ data: { id: 'em_1', status: 'queued' } }),
		})
		global.fetch = fetchSpy as unknown as typeof fetch

		const result = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>', companyId: 'c1' })

		expect(result).toEqual({ id: 'em_1', status: 'queued' })
		expect(fetchSpy).toHaveBeenCalledTimes(1)
		const [url, init] = fetchSpy.mock.calls[0]
		expect(url).toBe('https://email.relevel.ai/api/emails')
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_live_test')
		expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'email.sent' }))
	})

	it('throws and audits failure on a non-2xx response', async () => {
		process.env.MAILRELAY_API_KEY = 'sk_live_test'
		global.fetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 403,
			text: async () => 'domain unverified',
		}) as unknown as typeof fetch

		await expect(
			sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>', companyId: 'c1' }),
		).rejects.toThrow(/403/)
		expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'email.failed' }))
	})
})
