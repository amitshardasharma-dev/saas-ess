/**
 * Birch E2E — ADMIN (Birch owner) flows.
 * Add person → provisions login + temp pwd + instantiates the onboarding template;
 * configuration endpoints reachable; Settings reachable. Localhost-only.
 */
import { test, expect, api, tokenFor, gatePassed, FX, cleanupUser } from './birch-fixtures'

let adminTok: string
const NEW_EMAIL = `e2e.created.${Date.now().toString(36)}@birch-e2e.test`
let createdId = ''

test.describe.configure({ mode: 'serial' })

test.describe('ADMIN flows', () => {
  test.beforeAll(async () => { adminTok = await tokenFor(FX.users.admin.email) })
  test.afterAll(async () => { await cleanupUser(NEW_EMAIL) })

  test('Add person → 201 + temp password', async () => {
    const r = await api(adminTok, 'POST', '/api/people', { full_name: 'E2E Created Vol', email: NEW_EMAIL, role: 'employee', department: 'Street Outreach' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const person = r.body?.person as { id?: string; onboardingStatus?: string } | undefined
    expect(person?.id).toBeTruthy()
    expect(person?.onboardingStatus).toBe('not_started')
    expect(typeof r.body?.temp_password).toBe('string')
    createdId = person!.id!
  })

  test('Add person instantiates the onboarding template (9 typed steps)', async () => {
    const r = await api(adminTok, 'GET', `/api/onboarding?employee_id=${createdId}`)
    expect(r.status).toBe(200)
    const steps = (r.body?.steps as unknown[] | undefined) ?? []
    expect(steps.length).toBe(9)
    const titles = (steps as { title: string }[]).map((s) => s.title)
    expect(titles).toContain('Sign the Volunteer Agreement')
    expect(titles).toContain('Upload your Blue Card')
    expect(titles).toContain('Complete Safeguarding training')
  })

  test('configuration endpoints are reachable by admin (not gated out)', async () => {
    for (const path of ['/api/cert-types', '/api/documents', '/api/training/modules', '/api/reminders']) {
      const r = await api(adminTok, 'POST', path, {})
      expect(gatePassed(r.status), `${path} POST should pass the admin gate (got ${r.status})`).toBeTruthy()
    }
  })

  test('Settings reachable by admin', async () => {
    const r = await api(adminTok, 'GET', '/api/settings')
    expect(r.status).toBe(200)
  })
})
