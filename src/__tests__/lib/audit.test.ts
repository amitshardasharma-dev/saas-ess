// Mock supabase-server before importing the helper.
const mockInsert = jest.fn()
const mockFrom = jest.fn(() => ({ insert: (...args: unknown[]) => mockInsert(...args) }))

jest.mock('@/lib/supabase-server', () => ({
	supabaseAdmin: {
		from: (...args: unknown[]) => mockFrom(...args),
	},
}))

import { recordAudit } from '@/lib/audit'

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
		const row = mockInsert.mock.calls[0][0]
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
