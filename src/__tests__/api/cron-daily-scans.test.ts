/**
 * @jest-environment node
 *
 * Proves the daily-scans cron enqueues exactly one `reminders.scan` and one
 * `recert.scan` job per ACTIVE tenant, and that it is guarded by CRON_SECRET.
 *
 * supabaseAdmin is mocked with the same chainable builder used by jobs.test.ts:
 * `.from('ess_companies').select(...).eq('status','active')` resolves (awaited) to
 * the next queued result. enqueueJob is mocked so we assert the (type, companyId)
 * tuples it was called with rather than touching the DB.
 */
interface Result {
	data: unknown
	error: unknown
}
interface Recorded {
	method: string
	args: unknown[]
}

// eslint-disable-next-line no-var
var mockResultQueue: Result[] = []
// eslint-disable-next-line no-var
var mockRecorded: Recorded[][] = []

jest.mock('@/lib/supabase-admin', () => {
	function nextResult(): Result {
		return mockResultQueue.shift() ?? { data: null, error: null }
	}
	const from = jest.fn(() => {
		const calls: Recorded[] = []
		mockRecorded.push(calls)
		const result = nextResult()
		const chain: Record<string, unknown> = {}
		const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'lte', 'order', 'limit']
		chainMethods.forEach((m) => {
			chain[m] = (...args: unknown[]) => {
				calls.push({ method: m, args })
				return chain
			}
		})
		chain.single = (...args: unknown[]) => {
			calls.push({ method: 'single', args })
			return Promise.resolve(result)
		}
		;(chain as { then: unknown }).then = (resolve: (v: Result) => unknown) => resolve(result)
		return chain
	})
	return { supabaseAdmin: { from } }
})

const mockEnqueueJob = jest.fn(async (...args: unknown[]) => ({ id: 'job-x', args }))
jest.mock('@/lib/jobs/dispatch', () => ({
	enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/cron/daily-scans/route'

const SECRET = 'test-cron-secret'

function authedReq(): NextRequest {
	return new NextRequest('http://localhost/api/cron/daily-scans', {
		headers: { authorization: `Bearer ${SECRET}` },
	})
}

describe('GET /api/cron/daily-scans', () => {
	const origSecret = process.env.CRON_SECRET

	beforeEach(() => {
		jest.clearAllMocks()
		mockResultQueue = []
		mockRecorded = []
		process.env.CRON_SECRET = SECRET
	})

	afterAll(() => {
		process.env.CRON_SECRET = origSecret
	})

	it('returns 500 when CRON_SECRET is not configured', async () => {
		delete process.env.CRON_SECRET
		const res = await GET(authedReq())
		expect(res.status).toBe(500)
		expect(mockEnqueueJob).not.toHaveBeenCalled()
	})

	it('rejects requests without the secret', async () => {
		const res = await GET(new NextRequest('http://localhost/api/cron/daily-scans'))
		expect(res.status).toBe(401)
		expect(mockEnqueueJob).not.toHaveBeenCalled()
	})

	it('accepts the x-cron-secret header as an alternative to Bearer', async () => {
		mockResultQueue = [{ data: [], error: null }]
		const res = await GET(
			new NextRequest('http://localhost/api/cron/daily-scans', {
				headers: { 'x-cron-secret': SECRET },
			}),
		)
		expect(res.status).toBe(200)
	})

	it('enqueues reminders.scan + recert.scan + training.recert-scan for each active tenant, scoped to that tenant', async () => {
		mockResultQueue = [{ data: [{ id: 'co-1' }, { id: 'co-2' }], error: null }]

		const res = await GET(authedReq())
		const body = await res.json()

		expect(res.status).toBe(200)
		expect(body).toEqual({ tenants: 2, enqueued: 6 })

		// reminders.scan + recert.scan + training.recert-scan per tenant = 6 calls.
		expect(mockEnqueueJob).toHaveBeenCalledTimes(6)

		// Assert (type, companyId) tuples — payload is arg[1], companyId is arg[3].
		const tuples = mockEnqueueJob.mock.calls.map((c) => [c[0], c[3]])
		expect(tuples).toEqual(
			expect.arrayContaining([
				['reminders.scan', 'co-1'],
				['recert.scan', 'co-1'],
				['training.recert-scan', 'co-1'],
				['reminders.scan', 'co-2'],
				['recert.scan', 'co-2'],
				['training.recert-scan', 'co-2'],
			]),
		)

		// Tenant query filters on status = 'active'.
		const companyQuery = mockRecorded[0]
		expect(
			companyQuery.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'active'),
		).toBe(true)
	})

	it('enqueues nothing when there are no active tenants', async () => {
		mockResultQueue = [{ data: [], error: null }]
		const res = await GET(authedReq())
		const body = await res.json()
		expect(res.status).toBe(200)
		expect(body).toEqual({ tenants: 0, enqueued: 0 })
		expect(mockEnqueueJob).not.toHaveBeenCalled()
	})

	it('returns 500 and enqueues nothing when the tenant query errors', async () => {
		mockResultQueue = [{ data: null, error: { message: 'db down' } }]
		const res = await GET(authedReq())
		expect(res.status).toBe(500)
		expect(mockEnqueueJob).not.toHaveBeenCalled()
	})
})
