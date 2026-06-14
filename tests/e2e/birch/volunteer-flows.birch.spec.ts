/**
 * Birch E2E — VOLUNTEER (Street Outreach) flows.
 * Own onboarding renders typed Birch steps; volunteer cannot reach admin/staff
 * areas or other volunteers' records. Auto-complete wiring is an UNBUILT feature
 * (BUG-002) → test.fixme pending the build. Localhost-only.
 */
import { test, expect, api, tokenFor, FX, FOREIGN_EMPLOYEE_ID } from './birch-fixtures'

let volTok: string

test.beforeAll(async () => { volTok = await tokenFor(FX.users.volOutreach.email) })

test('My Onboarding renders the typed Birch steps', async () => {
  const r = await api(volTok, 'GET', '/api/onboarding')
  expect(r.status).toBe(200)
  const steps = (r.body?.steps as { title: string }[] | undefined) ?? []
  expect(steps.length).toBe(9)
  const titles = steps.map((s) => s.title)
  expect(titles).toContain('Sign the Volunteer Agreement')
  expect(titles).toContain('Upload your National Police Check')
  expect(titles).toContain('Complete Safeguarding training')
})

test('onboarding state starts not_started', async () => {
  const r = await api(volTok, 'GET', '/api/onboarding')
  const state = r.body?.state as { status?: string } | null
  expect(state?.status).toBe('not_started')
})

test.describe('Volunteer negatives', () => {
  test('cannot list people (403)', async () => {
    expect([401, 403]).toContain((await api(volTok, 'GET', '/api/people')).status)
  })
  test('cannot view another volunteer profile (403)', async () => {
    const r = await api(volTok, 'GET', `/api/people/${FX.users.volOpshop.employeeId}`)
    expect([401, 403]).toContain(r.status)
  })
  test('cannot write settings (403)', async () => {
    expect([401, 403]).toContain((await api(volTok, 'POST', '/api/settings', {})).status)
  })
  test('cannot reach another tenant via people detail (403/404)', async () => {
    const r = await api(volTok, 'GET', `/api/people/${FOREIGN_EMPLOYEE_ID}`)
    expect([401, 403, 404]).toContain(r.status)
  })
})

// BUG-002 RESOLVED: typed/linked onboarding steps now auto-complete from real
// artifact events (e-sign / doc-ack / cert / training). The full chain — incl.
// the e-sign Volunteer Agreement -> doc_sign step auto-complete — is proven in
// onboarding-autocomplete.birch.spec.ts (dedicated `volAuto` volunteer so this
// spec's pristine-onboarding assertions above stay valid). No fixme remains.
