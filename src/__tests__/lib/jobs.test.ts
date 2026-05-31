/**
 * @jest-environment node
 *
 * A flexible chainable supabaseAdmin mock. Each `.from()` builder resolves its
 * terminal call (single / await) to the next queued result, and records the
 * chained calls so tests can assert filters and update payloads.
 */
interface Result {
	data: unknown
	error: unknown
}
interface Recorded {
	method: string
	args: unknown[]
}

// State the factory closes over. Declared with `var` + `mock`-prefixed so jest's
// hoist guard allows the reference and the bindings exist when the factory runs.
// eslint-disable-next-line no-var
var mockResultQueue: Result[] = []
// eslint-disable-next-line no-var
var mockRecorded: Recorded[][] = []

jest.mock('@/lib/supabase-server', () => {
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

import { enqueueJob, claimDueJobs, markJobDone, markJobFailed, type Job } from '@/lib/jobs/dispatch'

function jobRow(over: Partial<Job> = {}): Job {
	return {
		id: 'job-1',
		company_id: null,
		type: 'test.job',
		payload: {},
		status: 'pending',
		run_after: new Date(Date.now() - 1000).toISOString(),
		attempts: 0,
		last_error: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...over,
	}
}

function lastUpdatePayload(): Record<string, unknown> {
	for (let i = mockRecorded.length - 1; i >= 0; i--) {
		const upd = mockRecorded[i].find((c) => c.method === 'update')
		if (upd) return upd.args[0] as Record<string, unknown>
	}
	throw new Error('no update recorded')
}

describe('jobs dispatch', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockResultQueue = []
		mockRecorded = []
	})

	it('enqueueJob inserts and returns the row', async () => {
		mockResultQueue = [{ data: jobRow(), error: null }]
		const job = await enqueueJob('test.job', { foo: 1 })
		expect(job.id).toBe('job-1')
		expect(mockRecorded[0].some((c) => c.method === 'insert')).toBe(true)
	})

	it('claimDueJobs filters pending + run_after and locks each candidate once', async () => {
		const candidate = jobRow()
		mockResultQueue = [
			{ data: [candidate], error: null }, // list query
			{ data: { ...candidate, status: 'running', attempts: 1 }, error: null }, // lock update
		]
		const claimed = await claimDueJobs(10)
		expect(claimed).toHaveLength(1)
		expect(claimed[0].status).toBe('running')

		const listCalls = mockRecorded[0]
		expect(listCalls.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'pending')).toBe(true)
		expect(listCalls.some((c) => c.method === 'lte' && c.args[0] === 'run_after')).toBe(true)
	})

	it('markJobDone sets status done', async () => {
		mockResultQueue = [{ data: null, error: null }]
		await markJobDone('job-1')
		expect(lastUpdatePayload().status).toBe('done')
	})

	it('markJobFailed re-queues with backoff when attempts remain', async () => {
		mockResultQueue = [{ data: null, error: null }]
		await markJobFailed({ id: 'job-1', attempts: 1 }, 'boom', 5)
		const upd = lastUpdatePayload()
		expect(upd.status).toBe('pending')
		expect(upd.last_error).toBe('boom')
		expect(new Date(upd.run_after as string).getTime()).toBeGreaterThan(Date.now())
	})

	it('markJobFailed marks failed when attempts exhausted', async () => {
		mockResultQueue = [{ data: null, error: null }]
		await markJobFailed({ id: 'job-1', attempts: 5 }, 'boom', 5)
		expect(lastUpdatePayload().status).toBe('failed')
	})
})
