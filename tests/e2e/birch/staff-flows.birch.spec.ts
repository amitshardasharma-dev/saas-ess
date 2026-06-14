/**
 * Birch E2E — STAFF (hr) flows: oversight without system config.
 * People + profile + compliance register + training report + comms; config blocked.
 */
import { test, expect, api, tokenFor, gatePassed, FX } from './birch-fixtures'

let staffTok: string
test.beforeAll(async () => { staffTok = await tokenFor(FX.users.staff.email) })

test('People list visible to staff', async () => {
  const r = await api(staffTok, 'GET', '/api/people')
  expect(r.status).toBe(200)
  expect(((r.body?.people as unknown[]) ?? []).length).toBeGreaterThan(0)
})

test('Open a volunteer profile (all sections aggregated)', async () => {
  const r = await api(staffTok, 'GET', `/api/people/${FX.users.volOutreach.employeeId}`)
  expect(r.status).toBe(200)
  const p = r.body?.person as Record<string, unknown> | undefined
  expect(p).toBeTruthy()
  for (const k of ['onboarding', 'certifications', 'documents', 'training', 'activity']) {
    expect(p, `profile missing "${k}"`).toHaveProperty(k)
  }
})

test('Compliance register readable by staff (scope=all)', async () => {
  const r = await api(staffTok, 'GET', '/api/certifications?scope=all')
  expect(gatePassed(r.status), `staff should read compliance (got ${r.status})`).toBeTruthy()
})

test('Training report readable by staff', async () => {
  const r = await api(staffTok, 'GET', '/api/reports/training')
  expect(gatePassed(r.status), `staff should read training report (got ${r.status})`).toBeTruthy()
})

test('Compliance CSV export reachable by staff', async () => {
  const r = await api(staffTok, 'GET', '/api/compliance/export')
  expect(gatePassed(r.status), `staff should export compliance (got ${r.status})`).toBeTruthy()
})

test('Staff can reach the communications send endpoint', async () => {
  const r = await api(staffTok, 'POST', '/api/communications', { subject: 'E2E test', body_html: '<p>hi</p>', target_type: 'all' })
  expect(gatePassed(r.status), `staff should pass the comms gate (got ${r.status})`).toBeTruthy()
})

test.describe('Staff negatives (no system config)', () => {
  test('cannot write settings (403)', async () => {
    expect([401, 403]).toContain((await api(staffTok, 'POST', '/api/settings', {})).status)
  })
  test('cannot configure modules (403)', async () => {
    expect([401, 403]).toContain((await api(staffTok, 'PUT', '/api/modules', {})).status)
  })
})
