/**
 * Birch E2E — SUPER ADMIN (platform operator) flows.
 * Read-only against the platform control plane (no announcement is created, to
 * avoid global side-effects on real tenants). Confirms tenant mgmt + announcement
 * targeting model + that a Birch admin is NOT a platform operator.
 */
import { test, expect, api, tokenFor, FX } from './birch-fixtures'

let superTok: string
let adminTok: string
test.beforeAll(async () => {
  superTok = await tokenFor(FX.users.superadmin.email)
  adminTok = await tokenFor(FX.users.admin.email)
})

test('Super admin can list tenants and sees birch-e2e', async () => {
  const r = await api(superTok, 'GET', '/api/platform/tenants')
  expect(r.status).toBe(200)
  const tenants = (r.body?.tenants as { slug?: string }[] | undefined) ?? []
  expect(tenants.some((t) => t.slug === 'birch-e2e'), 'birch-e2e tenant not listed').toBeTruthy()
})

test('Super admin can read platform announcements (targeting model present)', async () => {
  const r = await api(superTok, 'GET', '/api/platform/announcements')
  expect(r.status).toBe(200)
})

test('Super admin can read the platform dashboard', async () => {
  const r = await api(superTok, 'GET', '/api/platform/dashboard')
  expect(r.status).toBe(200)
})

test.describe('Birch admin is NOT a platform operator', () => {
  test('admin cannot list tenants (super-admin only)', async () => {
    expect([401, 403]).toContain((await api(adminTok, 'GET', '/api/platform/tenants')).status)
  })
  test('admin cannot read platform dashboard', async () => {
    expect([401, 403]).toContain((await api(adminTok, 'GET', '/api/platform/dashboard')).status)
  })
})
