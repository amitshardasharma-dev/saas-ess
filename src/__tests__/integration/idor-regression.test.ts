/**
 * @jest-environment node
 *
 * IDOR regression tests for the 6 routes fixed in Phase 0.
 *
 * A tenant-B caller asks for a tenant-A resource by id. Because every fixed
 * route now scopes its lookup by the caller's company_id, the scoped query finds
 * no row and the handler returns 404 (never leaking existence). We model that by
 * making the *target table* lookup resolve to `{ data: null }` while the auth
 * tables (ess_app_users / ess_employees) resolve to a valid tenant-B identity.
 *
 * We also assert the scoped query applied an `.eq('company_id', <tenantB>)`
 * filter, proving the ownership check (not just an unrelated 404) is in place.
 */
import { NextRequest } from 'next/server'

const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

interface Recorded {
	method: string
	args: unknown[]
}
interface Builder {
	table: string
	calls: Recorded[]
}

// All mock state lives inside the factory (jest hoists jest.mock above imports;
// keeping state inside avoids the temporal-dead-zone trap of outer `const`s).
// We expose the state + getUser mock on the mocked module so the test body can
// reset and assert on them.
jest.mock('@/lib/supabase-server', () => {
	const authResults: Record<string, { data: unknown; error: unknown }> = {
		ess_app_users: {
			data: { id: 'appuser-b', company_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role: 'manager', is_active: true, is_super_admin: false },
			error: null,
		},
		ess_employees: {
			data: { id: 'employee-b', full_name: 'B', is_approver: true, company_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
			error: null,
		},
	}

	const state: { builders: { table: string; calls: { method: string; args: unknown[] }[] }[] } = { builders: [] }
	const getUser = jest.fn()

	function makeBuilder(table: string) {
		const calls: { method: string; args: unknown[] }[] = []
		state.builders.push({ table, calls })
		const chain: Record<string, unknown> = {}
		const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'lte', 'order', 'limit', 'in']
		methods.forEach((m) => {
			chain[m] = (...args: unknown[]) => {
				calls.push({ method: m, args })
				return chain
			}
		})
		// Resolve the result at terminal time based on the filters actually applied.
		// The auth middleware looks up the caller's identity by a stable key
		// (ess_app_users by auth_user_id, ess_employees by app_user_id), so those
		// must return the tenant-B identity. Any OTHER lookup on those tables — e.g.
		// a route fetching a target row by id/company_id — is the cross-tenant
		// access under test and must resolve to null (→ 404). This is what proves
		// the ownership scoping, rather than the mock blindly returning a row.
		const resolveResult = () => {
			const hasEq = (col: string) =>
				calls.some((c) => c.method === 'eq' && c.args[0] === col)
			if (table === 'ess_app_users' && hasEq('auth_user_id')) return authResults.ess_app_users
			if (table === 'ess_employees' && hasEq('app_user_id')) return authResults.ess_employees
			return { data: null, error: null }
		}
		const terminal = (...args: unknown[]) => {
			calls.push({ method: 'single', args })
			return Promise.resolve(resolveResult())
		}
		chain.single = terminal
		chain.maybeSingle = terminal
		;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(resolveResult())
		return chain
	}

	return {
		supabaseAdmin: {
			auth: { getUser: (...args: unknown[]) => getUser(...args) },
			from: (table: string) => makeBuilder(table),
		},
		__state: state,
		__getUser: getUser,
	}
})

import * as supa from '@/lib/supabase-server'

const mockState = (supa as unknown as { __state: { builders: Builder[] } }).__state
const mockGetUser = (supa as unknown as { __getUser: jest.Mock }).__getUser

function authedReq(url: string, method = 'GET'): NextRequest {
	return new NextRequest(url, { method, headers: { authorization: 'Bearer faketoken' } })
}

function assertScopedToCompanyB(table: string) {
	const b = [...mockState.builders].reverse().find((x) => x.table === table)
	expect(b).toBeDefined()
	const scoped = b!.calls.some((c) => c.method === 'eq' && c.args[0] === 'company_id' && c.args[1] === COMPANY_B)
	expect(scoped).toBe(true)
}

describe('IDOR regression — tenant-B token gets 404 on tenant-A ids', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockState.builders.length = 0
		mockGetUser.mockResolvedValue({ data: { user: { id: 'authB', email: 'b@x.com' } }, error: null })
	})

	const uuidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

	it('employee/[id] is scoped by company_id', async () => {
		const { GET } = await import('@/app/api/employee/[id]/route')
		const res = await GET(authedReq(`http://t/api/employee/${uuidA}`), { params: Promise.resolve({ id: uuidA }) })
		expect(res.status).toBe(404)
		assertScopedToCompanyB('ess_employees')
	})

	it('leave-applications/[id] is scoped by company_id', async () => {
		const { GET } = await import('@/app/api/leave-applications/[id]/route')
		const res = await GET(authedReq(`http://t/api/leave-applications/${uuidA}`), { params: Promise.resolve({ id: uuidA }) })
		expect(res.status).toBe(404)
		assertScopedToCompanyB('ess_leave_applications')
	})

	it('timesheets/[id]/entries verifies the timesheet company', async () => {
		const { GET } = await import('@/app/api/timesheets/[id]/entries/route')
		const res = await GET(authedReq(`http://t/api/timesheets/${uuidA}/entries`), { params: Promise.resolve({ id: uuidA }) })
		expect(res.status).toBe(404)
		assertScopedToCompanyB('ess_timesheets')
	})

	it('documents/[id]/acknowledge verifies the document company', async () => {
		const { POST } = await import('@/app/api/documents/[id]/acknowledge/route')
		const res = await POST(authedReq(`http://t/api/documents/${uuidA}/acknowledge`, 'POST'), { params: Promise.resolve({ id: uuidA }) })
		expect(res.status).toBe(404)
		assertScopedToCompanyB('ess_documents')
	})

	it('approval-chain/[id] scopes the leave application by company_id', async () => {
		const { GET } = await import('@/app/api/approval-chain/[id]/route')
		const res = await GET(authedReq(`http://t/api/approval-chain/${uuidA}`), { params: Promise.resolve({ id: uuidA }) })
		expect(res.status).toBe(404)
		assertScopedToCompanyB('ess_leave_applications')
	})

	it('goals?employee_id= cross-tenant employee returns 404', async () => {
		const { GET } = await import('@/app/api/goals/route')
		const res = await GET(authedReq(`http://t/api/goals?employee_id=${uuidA}`), { params: Promise.resolve({}) })
		expect(res.status).toBe(404)
		assertScopedToCompanyB('ess_employees')
	})
})
