/**
 * Birch E2E — cross-cutting security boundaries.
 * - signed-document download requires auth + is tenant-scoped (private bucket).
 * - admin self-lockout guard (cannot demote/deactivate self).
 */
import { test, expect, api, tokenFor, FX, FOREIGN_EMPLOYEE_ID, BASE } from './birch-fixtures'

let adminTok: string
test.beforeAll(async () => { adminTok = await tokenFor(FX.users.admin.email) })

const RANDOM = '00000000-0000-0000-0000-0000000000ff'

test.describe('Signed-document access boundary (private bucket)', () => {
  test('download requires auth — no token → 401', async () => {
    const r = await api(null, 'GET', `/api/signed-documents/${RANDOM}/download`)
    expect(r.status).toBe(401)
  })
  test('download is not an open redirect to a public URL for an unknown id', async () => {
    // With a valid token, an unknown/foreign signed doc must not resolve (no leak).
    const r = await api(adminTok, 'GET', `/api/signed-documents/${RANDOM}/download`)
    expect([404, 403]).toContain(r.status)
  })
})

test.describe('Admin self-lockout guard', () => {
  test('admin cannot deactivate their own account (400)', async () => {
    const r = await api(adminTok, 'PATCH', `/api/people/${FX.users.admin.employeeId}`, { is_active: false })
    expect(r.status).toBe(400)
  })
  test('admin cannot change their own role (400)', async () => {
    const r = await api(adminTok, 'PATCH', `/api/people/${FX.users.admin.employeeId}`, { role: 'employee' })
    expect(r.status).toBe(400)
  })
})

test.describe('Tenant isolation (admin cannot mutate another tenant)', () => {
  test('PATCH foreign-tenant employee → 404', async () => {
    const r = await api(adminTok, 'PATCH', `/api/people/${FOREIGN_EMPLOYEE_ID}`, { role: 'manager' })
    expect(r.status).toBe(404)
  })
})

test('safety: BASE is localhost (never prod)', async () => {
  expect(BASE.startsWith('http://localhost') || BASE.includes('vercel.app') === false).toBeTruthy()
  expect(/saas-ess\.vercel\.app/.test(BASE)).toBeFalsy()
})
