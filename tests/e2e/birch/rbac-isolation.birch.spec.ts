/**
 * Birch E2E — cross-cutting RBAC matrix + tenant isolation (API level).
 * Roles: superadmin (platform), admin (Birch owner), staff (hr), two volunteers.
 * Runs against localhost only (guard in birch-fixtures).
 */
import { test, expect, api, tokenFor, gatePassed, FX, FOREIGN_EMPLOYEE_ID } from './birch-fixtures'

type Role = 'superadmin' | 'admin' | 'staff' | 'volOutreach' | 'volOpshop'
const ROLES: Role[] = ['superadmin', 'admin', 'staff', 'volOutreach', 'volOpshop']
const tokens: Partial<Record<Role, string>> = {}

test.beforeAll(async () => {
  for (const r of ROLES) tokens[r] = await tokenFor(FX.users[r].email)
})

// Expected gate pass (true) / deny (false) per role.
const ALL = { superadmin: true, admin: true, staff: true, volOutreach: true, volOpshop: true }
const HR_PLUS = { superadmin: true, admin: true, staff: true, volOutreach: false, volOpshop: false }
const ADMIN_PLUS = { superadmin: true, admin: true, staff: false, volOutreach: false, volOpshop: false }

// Verified against the route source: read endpoints (settings GET, training GET)
// are intentionally any-authenticated (volunteers need app config + to view their
// training); the privileged boundary is on the WRITES (POST settings = admin,
// POST training/modules = hr). people-list is manager+; people-create/settings-
// write/modules-config are admin; compliance-export is hr.
const MATRIX: { id: string; method: string; path: string; expect: Record<Role, boolean> }[] = [
  { id: 'people-list', method: 'GET', path: '/api/people', expect: HR_PLUS },
  { id: 'people-create', method: 'POST', path: '/api/people', expect: ADMIN_PLUS },
  { id: 'settings-read', method: 'GET', path: '/api/settings', expect: ALL },
  { id: 'settings-write', method: 'POST', path: '/api/settings', expect: ADMIN_PLUS },
  { id: 'modules-config', method: 'PUT', path: '/api/modules', expect: ADMIN_PLUS },
  { id: 'training-view', method: 'GET', path: '/api/training/modules', expect: ALL },
  { id: 'training-manage', method: 'POST', path: '/api/training/modules', expect: HR_PLUS },
  { id: 'compliance-export', method: 'GET', path: '/api/compliance/export', expect: HR_PLUS },
  { id: 'onboarding-self', method: 'GET', path: '/api/onboarding', expect: ALL },
]

for (const cell of MATRIX) {
  for (const role of ROLES) {
    const should = cell.expect[role]
    test(`RBAC ${cell.id} [${role}] → ${should ? 'ALLOW' : 'DENY'}`, async () => {
      const r = await api(tokens[role]!, cell.method, cell.path, cell.method === 'POST' || cell.method === 'PUT' ? {} : undefined)
      if (should) expect(gatePassed(r.status), `${role} expected to pass gate on ${cell.path} (got ${r.status})`).toBeTruthy()
      else expect([401, 403], `${role} expected DENY on ${cell.path} (got ${r.status})`).toContain(r.status)
    })
  }
}

test.describe('Tenant isolation (birch-e2e admin must never reach birch-foundation)', () => {
  test('GET /api/people returns only birch-e2e rows (no foreign-tenant emails)', async () => {
    const r = await api(tokens.admin!, 'GET', '/api/people')
    expect(r.status).toBe(200)
    const people = ((r.body?.people as { email?: string }[] | undefined) ?? [])
    const emails = people.map((p) => p.email ?? '')
    expect(emails.length).toBeGreaterThan(0)
    expect(emails.every((e: string) => e.endsWith('@birch-e2e.test')), `leaked non-e2e rows: ${emails.join(', ')}`).toBeTruthy()
  })

  test('GET /api/people/[foreign-tenant id] → 404 (no existence leak)', async () => {
    const r = await api(tokens.admin!, 'GET', `/api/people/${FOREIGN_EMPLOYEE_ID}`)
    expect(r.status).toBe(404)
  })

  test('PATCH /api/people/[foreign-tenant id] → 404', async () => {
    const r = await api(tokens.admin!, 'PATCH', `/api/people/${FOREIGN_EMPLOYEE_ID}`, { role: 'manager' })
    expect(r.status).toBe(404)
  })
})

test.describe('Volunteer negative access', () => {
  test('volunteer cannot list people (403)', async () => {
    const r = await api(tokens.volOutreach!, 'GET', '/api/people')
    expect([401, 403]).toContain(r.status)
  })
  test('volunteer cannot WRITE settings (403)', async () => {
    const r = await api(tokens.volOpshop!, 'POST', '/api/settings', {})
    expect([401, 403]).toContain(r.status)
  })
})
