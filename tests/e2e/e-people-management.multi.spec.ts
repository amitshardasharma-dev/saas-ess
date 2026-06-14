/**
 * Section E — User Profile Management (Admin create + manage).
 *
 * Covers the feature: an Admin creates a user profile (auth user + app_user +
 * employee + onboarding init) and manages it (role/department/active), in one
 * company-scoped place. Asserts the RBAC gate (admin-only writes), tenant
 * isolation (cross-tenant id → 404), and the anti-lockout self-guards.
 *
 * Serial: the create test seeds an id the later tests reuse. Self-cleans the
 * provisioned auth user + rows in afterAll (service role).
 */
import { test, expect, FIXTURES, ROLE_USERS, tokenFor, apiWithToken } from './fixtures'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
const ge = (k: string) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim() : ''
}
const sb = createClient(ge('NEXT_PUBLIC_SUPABASE_URL'), ge('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

// Unique per run so reruns don't collide on the email-uniqueness check.
const NEW_EMAIL = `e2e.people.${Date.now().toString(36)}@acme.test`

let adminTok: string
let hrTok: string
let mgrTok: string
let createdId = ''

test.describe.configure({ mode: 'serial' })

test.describe('E. User Profile Management (admin create + manage)', () => {
  test.beforeAll(async () => {
    adminTok = await tokenFor(ROLE_USERS.admin.email, ROLE_USERS.admin.password)
    hrTok = await tokenFor(ROLE_USERS.hr.email, ROLE_USERS.hr.password)
    mgrTok = await tokenFor(ROLE_USERS.manager.email, ROLE_USERS.manager.password)
  })

  test.afterAll(async () => {
    if (createdId) {
      await sb.from('ess_onboarding_steps').delete().eq('employee_id', createdId)
      await sb.from('ess_onboarding_states').delete().eq('employee_id', createdId)
      await sb.from('ess_employees').delete().eq('id', createdId)
    }
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const u = data?.users?.find((x) => x.email?.toLowerCase() === NEW_EMAIL)
    if (u) {
      await sb.from('ess_app_users').delete().eq('auth_user_id', u.id)
      await sb.auth.admin.deleteUser(u.id)
    }
  })

  test('E1 non-admin (hr) cannot create a profile → 403', async () => {
    const r = await apiWithToken(hrTok, 'POST', '/api/people', { full_name: 'Nope', email: NEW_EMAIL })
    expect([401, 403]).toContain(r.status)
  })

  test('E2 admin creates a profile → 201 + temp password', async () => {
    const r = await apiWithToken(adminTok, 'POST', '/api/people', {
      full_name: 'E2E People Member',
      email: NEW_EMAIL,
      role: 'employee',
      department: 'Field Ops',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body?.person?.id).toBeTruthy()
    expect(r.body?.person?.onboardingStatus).toBe('not_started')
    expect(r.body?.person?.role).toBe('employee')
    expect(typeof r.body?.temp_password).toBe('string') // we generated it
    createdId = r.body.person.id
  })

  test('E3 onboarding is initialised for the new person (steps > 0)', async () => {
    const r = await apiWithToken(adminTok, 'GET', `/api/onboarding?employee_id=${createdId}`)
    expect(r.status).toBe(200)
    expect(r.body?.state?.status).toBe('not_started')
    expect((r.body?.steps ?? []).length).toBeGreaterThan(0)
  })

  test('E4 the new person appears in the centralized people list', async () => {
    const r = await apiWithToken(adminTok, 'GET', '/api/people')
    expect(r.status).toBe(200)
    const person = (r.body?.people ?? []).find((p: { id: string }) => p.id === createdId)
    expect(person, 'created person present in /api/people').toBeTruthy()
    expect(person.isActive).toBe(true)
  })

  test('E5 admin manages the profile (role + department + deactivate) → 200', async () => {
    const r = await apiWithToken(adminTok, 'PATCH', `/api/people/${createdId}`, {
      role: 'manager',
      department: 'Operations',
      is_active: false,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body?.person?.role).toBe('manager')
    expect(r.body?.person?.orgUnit).toBe('Operations')
    expect(r.body?.person?.isActive).toBe(false)
  })

  test('E6 non-admin (manager) cannot manage a profile → 403', async () => {
    const r = await apiWithToken(mgrTok, 'PATCH', `/api/people/${createdId}`, { role: 'admin' })
    expect([401, 403]).toContain(r.status)
  })

  test('E7 cross-tenant manage → 404 (no existence leak)', async () => {
    const r = await apiWithToken(adminTok, 'PATCH', `/api/people/${FIXTURES.tenantB.admin.employeeId}`, { role: 'manager' })
    expect(r.status).toBe(404)
  })

  test('E8 admin cannot deactivate their own account → 400', async () => {
    const r = await apiWithToken(adminTok, 'PATCH', `/api/people/${ROLE_USERS.admin.employeeId}`, { is_active: false })
    expect(r.status).toBe(400)
  })

  test('E9 duplicate email is rejected → 409', async () => {
    const r = await apiWithToken(adminTok, 'POST', '/api/people', { full_name: 'Dup', email: NEW_EMAIL })
    expect(r.status).toBe(409)
  })
})
