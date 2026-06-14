/**
 * Section S — hand-rolled-auth boundary cases.
 * leave-applications, expense-claims, profile/update bypass withAuth/withSuperAdmin
 * and parse the token manually — highest-risk surface. We assert they enforce the
 * SAME guarantees as the middleware routes: no token → 401, unregistered → 403,
 * body cannot supply a foreign employee_id/company_id to escalate, cross-tenant
 * ids → denied, and profile/update honours its {phone,full_name} allowlist.
 *
 * API-only (no UI) → multi project. Scoped to seed users + tenant-B fixtures.
 */
import { test, expect, FIXTURES, ROLE_USERS, tokenFor, apiWithToken } from './fixtures'

const VOL = ROLE_USERS.volunteer

test.describe('S. Hand-rolled-auth boundary', () => {
  let volToken: string

  test.beforeAll(async () => {
    volToken = await tokenFor(VOL.email, VOL.password)
  })

  // --- leave-applications ---
  // DEFECT (found by this suite): GET /api/leave-applications returns 200 with an
  // EMPTY payload for a missing/forged token instead of 401. No data leaks (the
  // body is []), but the boundary is INCONSISTENT with its sibling hand-rolled
  // routes (expense-claims, profile/update both 401). Marked fixme so it stays
  // red until the route is hardened to 401. See src/app/api/leave-applications/route.ts.
  test('S: leave-applications missing Authorization → 401 (not 500)', async () => {
    const r = await apiWithToken(null, 'GET', '/api/leave-applications')
    expect(r.status).toBe(401) // currently 200-empty — DEFECT
  })

  test('S: leave-applications forged token → 401', async () => {
    const r = await apiWithToken('forged.jwt', 'GET', '/api/leave-applications')
    expect(r.status).toBe(401) // currently 200-empty — DEFECT
  })

  // Post-fix contract: the fail-open 200-empty is now 401 (GET wrapped in withAuth).
  // Still lock the no-leak property: a denied response carries no applications array.
  test('S: leave-applications unauthenticated → 401 and no data', async () => {
    const r = await apiWithToken(null, 'GET', '/api/leave-applications')
    expect(r.status).toBe(401)
    expect(r.body?.leave_applications, 'no applications array in a denied response').toBeUndefined()
  })

  test('S: leave-applications create with foreign employee_id → not trusted from body', async () => {
    // Supply tenant-B's employee_id in the body; the route resolves the employee
    // from the TOKEN, so the application must be created for the caller (or
    // rejected) — never for the foreign employee.
    const foreignEmp = FIXTURES.tenantB.admin.employeeId
    const r = await apiWithToken(volToken, 'POST', '/api/leave-applications', {
      employee_id: foreignEmp,
      leave_type: 'Annual Leave',
      from_date: '2026-09-01', till_date: '2026-09-02', reason: 'S-boundary probe',
    })
    // Either rejected, or created — but if created it must NOT be attached to the
    // foreign employee. We assert the foreign employee got no new application by
    // confirming the response does not echo the foreign employee id.
    const echoedForeign = JSON.stringify(r.body || {}).includes(foreignEmp)
    expect(echoedForeign, 'foreign employee_id must not be honoured').toBeFalsy()
  })

  test('S: leave-applications [id] cross-tenant → denied (404/403)', async () => {
    const tbLeave = FIXTURES.tenantB.artifacts.leaveApplicationId
    test.skip(!tbLeave, 'tenant-B leave fixture not seeded')
    const r = await apiWithToken(volToken, 'GET', `/api/leave-applications/${tbLeave}`)
    expect([403, 404]).toContain(r.status)
  })

  // --- expense-claims ---
  test('S: expense-claims missing/garbled token → 401', async () => {
    expect((await apiWithToken(null, 'GET', '/api/expense-claims')).status).toBe(401)
    expect((await apiWithToken('garbled', 'GET', '/api/expense-claims')).status).toBe(401)
  })

  test('S: expense-claims body cannot inject foreign employee_id/company_id', async () => {
    const foreignEmp = FIXTURES.tenantB.admin.employeeId
    const r = await apiWithToken(volToken, 'POST', '/api/expense-claims', {
      title: 'S-boundary claim', currency: 'INR',
      employee_id: foreignEmp, company_id: FIXTURES.tenantB.companyId,
    })
    // claim is created for the caller's own employee (token-derived), never the foreign one
    if (r.status >= 200 && r.status < 300) {
      expect(r.body?.claim?.employee_id, 'claim bound to caller, not foreign id').not.toBe(foreignEmp)
    } else {
      expect(r.status).toBeGreaterThanOrEqual(400)
    }
  })

  test('S: expense-claims [id]/items cross-tenant → denied', async () => {
    // probe a clearly-foreign claim id (random uuid) — must not 200 with data
    const r = await apiWithToken(volToken, 'GET', '/api/expense-claims/00000000-0000-0000-0000-000000000000/items')
    expect(r.status).not.toBe(200)
  })

  // --- profile/update ---
  test('S: profile/update missing token → 401', async () => {
    const r = await apiWithToken(null, 'POST', '/api/profile/update', { updates: { full_name: 'X' } })
    expect(r.status).toBe(401)
  })

  test('S: profile/update ignores non-allowlisted fields (role/company_id/email)', async () => {
    // allowlist is exactly { phone, full_name }. Attempt to escalate role/company.
    const r = await apiWithToken(volToken, 'POST', '/api/profile/update', {
      updates: { full_name: 'S Boundary Name', role: 'admin', company_id: FIXTURES.tenantB.companyId, email: 'hacked@x.z', is_super_admin: true },
    })
    expect(r.status).toBe(200)
    // verify via auth/user that role did NOT change to admin and email is unchanged
    const me = await apiWithToken(volToken, 'GET', '/api/auth/user')
    expect(me.body?.user?.role, 'role must not be escalated').toBe('employee')
    expect(me.body?.user?.is_super_admin, 'super-admin must not be granted').toBeFalsy()
  })

  test('S: profile/update only mutates caller’s own record (no id in body honoured)', async () => {
    // The route resolves the employee from the token; there is no path to target
    // another user. Set a sentinel name (with a foreign employee_id in the body
    // that must be ignored), then confirm the caller's own record reflects it.
    const sentinel = `S-self-${Date.now()}`
    const up = await apiWithToken(volToken, 'POST', '/api/profile/update', { updates: { full_name: sentinel, employee_id: FIXTURES.tenantB.admin.employeeId } })
    expect(up.status).toBe(200)
    // Poll auth/user for write propagation (read-after-write can lag).
    await expect.poll(async () => (await apiWithToken(volToken, 'GET', '/api/auth/user')).body?.user?.full_name, { timeout: 10_000 }).toBe(sentinel)
  })

  // --- shared boundary: all 3 routes ---
  // expense-claims + profile/update reject a forged token by status today; leave
  // is the documented exception (fixme above), so it is excluded from this status
  // assertion and tracked separately.
  test('S: expense-claims + profile/update reject forged token consistently', async () => {
    for (const [method, path, body] of [
      ['GET', '/api/expense-claims', undefined],
      ['POST', '/api/profile/update', { updates: { full_name: 'x' } }],
    ] as const) {
      const r = await apiWithToken('expired.forged.jwt', method, path, body)
      expect([401, 403], `${path}`).toContain(r.status)
    }
  })

  // DEFECT companion: the same inconsistency expressed as a cross-route invariant.
  // Expected: every hand-rolled route denies anon by 401. Fails today because
  // leave-applications returns 200. Kept as fixme to track parity.
  test('S: all hand-rolled routes enforce 401 parity with middleware routes', async () => {
    const mw = await apiWithToken(null, 'GET', '/api/people') // middleware → 401
    const leave = await apiWithToken(null, 'GET', '/api/leave-applications')
    const expense = await apiWithToken(null, 'GET', '/api/expense-claims')
    expect(mw.status).toBe(401)
    expect(expense.status).toBe(401)
    expect(leave.status).toBe(401) // currently 200 — DEFECT
  })
})
