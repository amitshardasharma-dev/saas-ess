/**
 * @jest-environment node
 */

// Mock supabase-server. The factory defines its own jest.fns (names prefixed
// with `mock` so jest's hoist guard allows them) and exposes them so tests can
// assert on calls and swap the insert result.
jest.mock('@/lib/supabase-admin', () => {
	const mockInsert = jest.fn().mockResolvedValue({ error: null })
	const mockFrom = jest.fn(() => ({ insert: mockInsert }))
	return {
		supabaseAdmin: { from: mockFrom },
		__mockInsert: mockInsert,
		__mockFrom: mockFrom,
	}
})

import { recordAudit } from '@/lib/audit'
import * as supa from '@/lib/supabase-admin'

const mockInsert = (supa as unknown as { __mockInsert: jest.Mock }).__mockInsert
const mockFrom = (supa as unknown as { __mockFrom: jest.Mock }).__mockFrom

describe('recordAudit', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockInsert.mockResolvedValue({ error: null })
	})

	it('inserts a row into ess_audit_log with mapped columns', async () => {
		await recordAudit({
			companyId: 'c1',
			actorId: 'u1',
			action: 'tenant.created',
			target: { type: 'company', id: 'c1' },
			meta: { name: 'Acme' },
		})

		expect(mockFrom).toHaveBeenCalledWith('ess_audit_log')
		const row = mockInsert.mock.calls[0][0] as Record<string, unknown>
		expect(row.action).toBe('tenant.created')
		expect(row.company_id).toBe('c1')
		expect(row.actor_app_user_id).toBe('u1')
		expect(row.target_type).toBe('company')
		expect(row.target_id).toBe('c1')
		expect(row.meta).toEqual({ name: 'Acme' })
	})

	it('swallows errors and does not throw', async () => {
		mockInsert.mockResolvedValue({ error: { message: 'db down' } })
		await expect(recordAudit({ action: 'x' })).resolves.toBeUndefined()
	})
})
