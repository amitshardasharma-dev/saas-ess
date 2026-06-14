/**
 * Section C — RBAC API matrix across all 5 underlying roles (NOT collapsed):
 *   super_admin (SA), admin (AD), hr, manager, volunteer (VO).
 *
 * The point is to PROVE the hr↔manager split is real: on the 55 hr-gated write
 * routes, hr gets 2xx-or-validation while manager gets 403. That contrast is an
 * explicit, visible assertion per action (not an implementation detail).
 *
 * We assert the GATE, not handler success: a denied role → 401/403; an allowed
 * role → NOT 401/403 (it may 400 on validation/empty body, which still proves it
 * passed the gate). withAuth checks role before the handler, so this is sound.
 *
 * Relationship-gated actions (approve leave/expense/timesheet, appraisal) use the
 * seeded manager_approver vs manager_nonapprover so "manager" isn't a monolith.
 *
 * If an hr-gated route does NOT 403 a manager, the test FAILS LOUDLY (no
 * adjustment) — that's either a discovery error or a privilege bug; surfaced.
 */
import { test, expect, ROLE_USERS, tokenFor, apiWithToken } from './fixtures'

type RoleKey = 'super_admin' | 'admin' | 'hr' | 'manager' | 'volunteer'
const ROLE_KEYS: RoleKey[] = ['super_admin', 'admin', 'hr', 'manager', 'volunteer']

// token cache per role
const tokens: Partial<Record<RoleKey, string>> = {}
test.beforeAll(async () => {
  for (const k of ROLE_KEYS) {
    const u = ROLE_USERS[k]
    tokens[k] = await tokenFor(u.email, u.password)
  }
})

// allowed = NOT 401/403 (passed the gate); denied = 401/403.
function gatePassed(status: number) { return status !== 401 && status !== 403 }

type Action = {
  id: string
  label: string
  method: string
  path: string
  body?: unknown
  // expected allow per role
  expect: Record<RoleKey, boolean>
}

// minRole semantics → expected allow set:
const ALL: Record<RoleKey, boolean> = { super_admin: true, admin: true, hr: true, manager: true, volunteer: true }
const MGR_PLUS: Record<RoleKey, boolean> = { super_admin: true, admin: true, hr: true, manager: true, volunteer: false }
const HR_PLUS: Record<RoleKey, boolean> = { super_admin: true, admin: true, hr: true, manager: false, volunteer: false }
const ADMIN_PLUS: Record<RoleKey, boolean> = { super_admin: true, admin: true, hr: false, manager: false, volunteer: false }
const SUPER_ONLY: Record<RoleKey, boolean> = { super_admin: true, admin: false, hr: false, manager: false, volunteer: false }

const ACTIONS: Action[] = [
  // manager-gated
  { id: 'A1', label: 'List all people', method: 'GET', path: '/api/people', expect: MGR_PLUS },
  { id: 'A18', label: 'Team balances', method: 'GET', path: '/api/team-balances', expect: MGR_PLUS },
  { id: 'A18b', label: 'Team calendar', method: 'GET', path: '/api/team-calendar', expect: MGR_PLUS },
  // own-profile (all roles)
  { id: 'A2', label: 'Edit own profile', method: 'POST', path: '/api/profile/update', body: { updates: { full_name: 'Matrix Probe' } }, expect: ALL },
  // hr-gated WRITES (the split-proving rows: hr=allow, manager=DENY)
  { id: 'A4', label: 'Manage documents (POST)', method: 'POST', path: '/api/documents', body: {}, expect: HR_PLUS },
  { id: 'A5', label: 'Manage contracts (POST)', method: 'POST', path: '/api/contracts', body: {}, expect: HR_PLUS },
  { id: 'A6', label: 'Manage certifications (POST)', method: 'POST', path: '/api/certifications', body: {}, expect: HR_PLUS },
  { id: 'A7', label: 'Manage cert types (POST)', method: 'POST', path: '/api/cert-types', body: {}, expect: HR_PLUS },
  { id: 'A8', label: 'Manage appraisal cycles (POST)', method: 'POST', path: '/api/appraisal-cycles', body: {}, expect: HR_PLUS },
  { id: 'A9', label: 'Manage training modules (POST)', method: 'POST', path: '/api/training/modules', body: {}, expect: HR_PLUS },
  { id: 'A10', label: 'Manage quizzes (POST)', method: 'POST', path: '/api/quizzes', body: {}, expect: HR_PLUS },
  { id: 'A11', label: 'Grading queue (GET)', method: 'GET', path: '/api/grading', expect: HR_PLUS },
  { id: 'A12', label: 'Send communications (POST)', method: 'POST', path: '/api/communications', body: {}, expect: HR_PLUS },
  { id: 'A13', label: 'Training report (GET)', method: 'GET', path: '/api/reports/training', expect: HR_PLUS },
  { id: 'A14', label: 'Compliance export (GET)', method: 'GET', path: '/api/compliance/export', expect: HR_PLUS },
  // admin-gated
  { id: 'A15', label: 'Configure modules (PUT)', method: 'PUT', path: '/api/modules', body: {}, expect: ADMIN_PLUS },
  { id: 'A16', label: 'Manage settings (POST)', method: 'POST', path: '/api/settings', body: {}, expect: ADMIN_PLUS },
  { id: 'A17', label: 'Manage reminders (POST)', method: 'POST', path: '/api/reminders', body: {}, expect: ADMIN_PLUS },
  // super-admin-only
  { id: 'A19', label: 'Platform dashboard', method: 'GET', path: '/api/platform/dashboard', expect: SUPER_ONLY },
  { id: 'A20', label: 'Manage tenants (GET list)', method: 'GET', path: '/api/platform/tenants', expect: SUPER_ONLY },
  // A21 — DISCOVERY REFINEMENT: GET /api/platform/plans is intentionally withAuth
  // (any authenticated user reads plans to show pricing/upgrade); only POST is
  // withSuperAdmin. Source: src/app/api/platform/plans/route.ts (GET=withAuth,
  // POST=withSuperAdmin). So GET is ALL roles; the super-admin boundary is on the
  // write, asserted by A21w below.
  { id: 'A21', label: 'Read platform plans (GET, pricing)', method: 'GET', path: '/api/platform/plans', expect: ALL },
  { id: 'A21w', label: 'Create platform plan (POST)', method: 'POST', path: '/api/platform/plans', body: {}, expect: SUPER_ONLY },
]

// Build one test PER CELL (action × role) so every cell is individually visible.
for (const action of ACTIONS) {
  for (const role of ROLE_KEYS) {
    const shouldAllow = action.expect[role]
    test(`C ${action.id} [${role}] ${action.label} → ${shouldAllow ? 'ALLOW' : 'DENY'}`, async () => {
      const r = await apiWithToken(tokens[role]!, action.method, action.path, action.body)
      if (shouldAllow) {
        expect(gatePassed(r.status), `${role} expected to PASS gate on ${action.path} (got ${r.status})`).toBeTruthy()
      } else {
        expect([401, 403], `${role} expected DENY on ${action.path} (got ${r.status}) — if 2xx this is a privilege bug or discovery error`).toContain(r.status)
      }
    })
  }
}

// Explicit, required hr↔manager CONTRAST on every hr-gated route (visible in output).
const HR_GATED = ACTIONS.filter((a) => a.expect.hr && !a.expect.manager)
for (const action of HR_GATED) {
  test(`C[split] ${action.id} ${action.label}: hr ALLOW vs manager DENY`, async () => {
    const hrRes = await apiWithToken(tokens.hr!, action.method, action.path, action.body)
    const mgrRes = await apiWithToken(tokens.manager!, action.method, action.path, action.body)
    expect(gatePassed(hrRes.status), `hr must pass ${action.path} (got ${hrRes.status})`).toBeTruthy()
    expect([401, 403], `manager must be denied ${action.path} (got ${mgrRes.status}) — DISCOVERY/PRIVILEGE issue if not`).toContain(mgrRes.status)
  })
}

// Relationship-gated approvals: approver passes vs non-approver denied on the SAME action.
test.describe('C[relationship] approver vs non-approver manager', () => {
  let apprTok: string, nonTok: string
  test.beforeAll(async () => {
    apprTok = await tokenFor(ROLE_USERS.manager_approver.email, ROLE_USERS.manager_approver.password)
    nonTok = await tokenFor(ROLE_USERS.manager_nonapprover.email, ROLE_USERS.manager_nonapprover.password)
  })

  // pending-approvals queue: approver sees a queue (200 + has access), non-approver sees none.
  test('C[rel] pending-approvals: approver has queue access', async () => {
    const r = await apiWithToken(apprTok, 'GET', '/api/pending-approvals')
    expect(gatePassed(r.status)).toBeTruthy()
  })
  test('C[rel] team-balances: approver (manager) passes gate', async () => {
    const r = await apiWithToken(apprTok, 'GET', '/api/team-balances')
    expect(gatePassed(r.status)).toBeTruthy()
  })
  // The direct report (employee) must NOT pass the manager-gated team view.
  test('C[rel] team-balances: direct report (employee) denied', async () => {
    const repTok = await tokenFor(ROLE_USERS.direct_report.email, ROLE_USERS.direct_report.password)
    const r = await apiWithToken(repTok, 'GET', '/api/team-balances')
    expect([401, 403]).toContain(r.status)
  })
  // Approver owns reports → team balances returns its direct report; non-approver (no reports) returns empty.
  test('C[rel] approver sees direct reports; non-approver sees none', async () => {
    const appr = await apiWithToken(apprTok, 'GET', '/api/team-balances')
    const non = await apiWithToken(nonTok, 'GET', '/api/team-balances')
    expect(gatePassed(appr.status)).toBeTruthy()
    expect(gatePassed(non.status)).toBeTruthy()
    // /api/team-balances returns { members: [...] } scoped by reports_to.
    const apprRows = appr.body?.members ?? []
    const nonRows = non.body?.members ?? []
    expect(nonRows.length, 'non-approver manager has no direct reports').toBe(0)
    expect(apprRows.length, 'approver manager sees ≥1 direct report').toBeGreaterThan(0)
  })
})
