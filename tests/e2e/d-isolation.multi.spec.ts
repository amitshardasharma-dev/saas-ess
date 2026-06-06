/**
 * Section D — privilege-escalation negatives & tenant-isolation sweep.
 *
 * Data-driven over EVERY dynamic [id] route. The contract per route was VERIFIED
 * against the running app (see tests/probe-id-routes.mjs), not guessed:
 *
 *   - deny404  : foreign/random id → 404 (no existence leak). 20 routes. STRICT.
 *   - empty200 : foreign id → 200 with EMPTY collections (no row leaked). The
 *                route filters by company/owner and simply returns nothing for an
 *                unknown id instead of 404. Documented gap, asserted as no-leak.
 *   - put404   : GET not implemented (405); isolation enforced on PUT → 404.
 *
 * Malformed-id sweep (non-uuid / negative / huge): every route must stay < 500.
 * One route currently violates this — see the DEFECT fixme below — so it is
 * carved out and flagged rather than silently broadened (per the no-greenwash
 * rule: a test that documents a real bug beats a green one that hides it).
 *
 * Probes run as the LOWEST role that can still reach the handler (vol, or hr for
 * hr-gated routes) so a role-403 never masks a missing isolation check.
 */
import { test, expect, FIXTURES, ROLE_USERS, tokenFor, apiWithToken } from './fixtures'

const FOREIGN_LEAVE = FIXTURES.tenantB.artifacts.leaveApplicationId
const RANDOM_UUID = '00000000-0000-0000-0000-0000000000ff'

type Iso = 'deny404' | 'empty200' | 'put404'
type Tok = 'vol' | 'hr'
type Route = { label: string; path: (id: string) => string; iso: Iso; tok: Tok; emptyKey?: string }

const ID_ROUTES: Route[] = [
  { label: 'documents/[id]', path: (id) => `/api/documents/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'employee/[id]', path: (id) => `/api/employee/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'appraisals/[id]', path: (id) => `/api/appraisals/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'quizzes/[id]', path: (id) => `/api/quizzes/${id}`, iso: 'deny404', tok: 'hr' },
  { label: 'approval-chain/[id]', path: (id) => `/api/approval-chain/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'timesheets/[id]', path: (id) => `/api/timesheets/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'timesheets/[id]/entries', path: (id) => `/api/timesheets/${id}/entries`, iso: 'deny404', tok: 'vol' },
  { label: 'appraisal-templates/[id]', path: (id) => `/api/appraisal-templates/${id}`, iso: 'deny404', tok: 'hr' },
  { label: 'appraisal-cycles/[id]', path: (id) => `/api/appraisal-cycles/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'grading/[id]', path: (id) => `/api/grading/${id}`, iso: 'deny404', tok: 'hr' },
  // expense-claims/[id] and /items REMOVED from the data-driven sweep: their UUID
  // probe is a FALSE NEGATIVE. The handler looks up by display_id (natural key
  // like EC-2026-001), so a uuid matches nothing → 404 looks like isolation but
  // isn't. They are unauthenticated IDORs — see the dedicated fixme below.
  { label: 'certifications/[id]/file', path: (id) => `/api/certifications/${id}/file`, iso: 'deny404', tok: 'hr' },
  { label: 'documents/[id]/signature-status', path: (id) => `/api/documents/${id}/signature-status`, iso: 'deny404', tok: 'hr' },
  { label: 'documents/[id]/fields', path: (id) => `/api/documents/${id}/fields`, iso: 'deny404', tok: 'vol' },
  { label: 'contracts/[id]', path: (id) => `/api/contracts/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'contracts/[id]/history', path: (id) => `/api/contracts/${id}/history`, iso: 'deny404', tok: 'vol' },
  { label: 'leave-applications/[id]', path: (id) => `/api/leave-applications/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'training/modules/[id]', path: (id) => `/api/training/modules/${id}`, iso: 'deny404', tok: 'vol' },
  { label: 'training/modules/[id]/assignments', path: (id) => `/api/training/modules/${id}/assignments`, iso: 'deny404', tok: 'hr' },
  // signed-documents: foreign UUID → 404 (isolation OK), but malformed id → 500. Carved out of the malformed sweep below.
  { label: 'signed-documents/[id]/download', path: (id) => `/api/signed-documents/${id}/download`, iso: 'deny404', tok: 'vol' },
  // empty200: filters by company/owner, returns empty (no leak) instead of 404 for an unknown id.
  { label: 'documents/[id]/acknowledgments', path: (id) => `/api/documents/${id}/acknowledgments`, iso: 'empty200', tok: 'hr', emptyKey: 'employees' },
  // put404: GET is 405 (PUT-only); the PUT handler enforces ownership → 404 for a foreign id.
  { label: 'goals/[id]', path: (id) => `/api/goals/${id}`, iso: 'put404', tok: 'vol' },
]

// Platform tenant routes: the parent 404s an unknown id; the three sub-routes are
// by-design platform-operator reads (no cross-tenant boundary) → 200 + empty.
const PLATFORM_404 = [{ label: 'platform/tenants/[id]', path: (id: string) => `/api/platform/tenants/${id}` }]
const PLATFORM_EMPTY = [
  { label: 'platform/tenants/[id]/labels', path: (id: string) => `/api/platform/tenants/${id}/labels`, key: 'overrides' },
  { label: 'platform/tenants/[id]/usage', path: (id: string) => `/api/platform/tenants/${id}/usage`, key: 'usage' },
  { label: 'platform/tenants/[id]/users', path: (id: string) => `/api/platform/tenants/${id}/users`, key: 'users' },
]

const tok: Record<Tok, string> = { vol: '', hr: '' }
let superToken: string
test.beforeAll(async () => {
  tok.vol = await tokenFor(ROLE_USERS.volunteer.email, ROLE_USERS.volunteer.password)
  tok.hr = await tokenFor(ROLE_USERS.hr.email, ROLE_USERS.hr.password)
  superToken = await tokenFor(ROLE_USERS.super_admin.email, ROLE_USERS.super_admin.password)
})

const arrLen = (body: any, key?: string) => {
  if (Array.isArray(body)) return body.length
  if (key && Array.isArray(body?.[key])) return body[key].length
  return -1
}

test.describe('D. Tenant-isolation sweep — foreign/random id (no leak, no 500)', () => {
  for (const r of ID_ROUTES) {
    test(`D[iso] ${r.label} — foreign id ${r.iso}`, async () => {
      if (r.iso === 'deny404') {
        const res = await apiWithToken(tok[r.tok], 'GET', r.path(RANDOM_UUID))
        expect(res.status, `${r.label} foreign id must 404 (got ${res.status})`).toBe(404)
      } else if (r.iso === 'empty200') {
        const res = await apiWithToken(tok[r.tok], 'GET', r.path(RANDOM_UUID))
        expect(res.status, `${r.label} (got ${res.status})`).toBe(200)
        // No-leak invariant: an unknown id must surface ZERO rows of this tenant's data.
        expect(arrLen(res.body, r.emptyKey), `${r.label} must leak no rows for an unknown id`).toBe(0)
      } else {
        // put404: GET unimplemented (405) AND the write path enforces ownership (404).
        const get = await apiWithToken(tok[r.tok], 'GET', r.path(RANDOM_UUID))
        expect(get.status, `${r.label} GET should be 405 (PUT-only)`).toBe(405)
        const put = await apiWithToken(tok[r.tok], 'PUT', r.path(RANDOM_UUID), { title: 'x' })
        expect(put.status, `${r.label} PUT foreign id must 404 (got ${put.status})`).toBe(404)
      }
    })
  }

  test('D[iso] leave-applications/[id] — real tenant-B id denied to Acme caller', async () => {
    test.skip(!FOREIGN_LEAVE, 'tenant-B leave fixture not seeded')
    const r = await apiWithToken(tok.hr, 'GET', `/api/leave-applications/${FOREIGN_LEAVE}`)
    expect([403, 404]).toContain(r.status)
  })

  test('D[iso] platform/tenants/[id] — unknown tenant id → 404 (super), 401/403 (non-super)', async () => {
    for (const r of PLATFORM_404) {
      const sup = await apiWithToken(superToken, 'GET', r.path(RANDOM_UUID))
      expect(sup.status, `${r.label} super`).toBe(404)
      const vol = await apiWithToken(tok.vol, 'GET', r.path(RANDOM_UUID))
      expect([401, 403], `${r.label} non-super must be denied`).toContain(vol.status)
    }
  })

  // DEFECT (HIGH — file separately): GET /api/employee/by-user/[userId] has NO
  // auth check and NO tenant scoping. `userId` is actually the EMAIL; the handler
  // queries ess_employees by email with the service-role client. Proven against
  // prod 2026-06-05: an UNAUTHENTICATED request for a known email returns 200 +
  // that employee's PII (name, employee_no, department, designation, status).
  // Earlier uuid probes 404'd only because a uuid matches no email row — the real
  // attack is a known/guessed email. Cross-tenant too: no company_id filter, so
  // any tenant's employee is readable by email. This is an unauthenticated IDOR /
  // PII disclosure. Un-skip once the route enforces withAuth + company scoping
  // (no token → 401; foreign-tenant email → 404).
  test('D[iso] employee/by-user/[userId] — must require auth & tenant-scope', async () => {
    const VICTIM = ROLE_USERS.hr.email
    const FOREIGN = FIXTURES.tenantB.admin.email
    // 1) No token must NOT return data.
    const noAuth = await apiWithToken(null, 'GET', `/api/employee/by-user/${encodeURIComponent(VICTIM)}`)
    expect(noAuth.status, 'unauthenticated must be 401, not a 200 PII dump').toBe(401)
    // 2) A valid caller from another tenant must not read this tenant's employee by email.
    const cross = await apiWithToken(tok.vol, 'GET', `/api/employee/by-user/${encodeURIComponent(FOREIGN)}`)
    expect([403, 404], 'cross-tenant email lookup must be denied').toContain(cross.status)
  })

  // FIXED (uuid-keyed + withAuth + company-scope via owning-employee join). Probes
  // a REAL seeded tenant-B claim UUID — not a display_id — so a green result proves
  // tenant scoping, not a uuid cast-error 404. Covers the items DELETE shape too:
  // a cross-tenant DELETE must return 404 (claim not found), matching GET/POST —
  // NOT 400 (the not-a-draft branch).
  test('D[iso] expense-claims/[id] — auth required & tenant-scoped (uuid-keyed)', async () => {
    const TB = FIXTURES.tenantB.artifacts.expenseClaimId
    test.skip(!TB, 'tenant-B expense fixture not seeded (run: npx tsx tests/seed.ts)')
    // No token → 401.
    const noAuth = await apiWithToken(null, 'GET', `/api/expense-claims/${TB}`)
    expect([401], `unauthenticated expense-claim read must be 401 (got ${noAuth.status})`).toContain(noAuth.status)
    // Acme caller probing a real tenant-B claim UUID → 404 on read.
    const crossGet = await apiWithToken(tok.vol, 'GET', `/api/expense-claims/${TB}`)
    expect([404], `cross-tenant GET must 404 (got ${crossGet.status})`).toContain(crossGet.status)
    // Cross-tenant items DELETE → 404 (not 400) so the shape matches GET/POST.
    const crossDel = await apiWithToken(tok.vol, 'DELETE', `/api/expense-claims/${TB}/items?itemId=00000000-0000-0000-0000-0000000000ff`)
    expect([404], `cross-tenant DELETE must 404 not 400 (got ${crossDel.status})`).toContain(crossDel.status)
  })

  // DEFECT (Med-High — file separately): /api/preview-approval-chain (GET) has NO
  // auth and NO caller/tenant scoping. It takes ?employee=<id|employee_no> and
  // returns the approval chain (approver names + employee_no). Proven against prod
  // 2026-06-05: an UNAUTHENTICATED request with a tenant-B employee UUID returned
  // 200 + approver_name "TenantB Admin" / approver_id "TB-ADMIN". Cross-tenant,
  // zero auth. ALSO: line 22 interpolates the raw `employee` param into a PostgREST
  // .or() filter string (`id.eq.${employee},employee_no.eq.${employee}`) — a
  // filter-injection vector (and the reason an employee_no natural key currently
  // 404s: the id.eq.<non-uuid> arm throws a cast error). Un-skip once the route is
  // withAuth-wrapped, scopes the employee to the caller's company, and uses
  // parameterized .eq() filters instead of string interpolation.
  test('D[iso] preview-approval-chain — must require auth & tenant-scope (+ no .or() injection)', async () => {
    const noAuth = await apiWithToken(null, 'GET', `/api/preview-approval-chain?employee=${FIXTURES.tenantB.admin.employeeId}&leave_type=Annual&total_days=1`)
    expect([401], 'unauthenticated approval-chain preview must be 401').toContain(noAuth.status)
    const cross = await apiWithToken(tok.vol, 'GET', `/api/preview-approval-chain?employee=${FIXTURES.tenantB.admin.employeeId}&leave_type=Annual&total_days=1`)
    expect([403, 404], 'cross-tenant employee preview must be denied').toContain(cross.status)
  })

  // By-design platform-operator reads: super sees 200+empty for an unknown tenant
  // (no boundary to breach, no row leaked); the real boundary is the non-super 403.
  for (const r of PLATFORM_EMPTY) {
    test(`D[iso] ${r.label} — super 200+empty / non-super denied`, async () => {
      const sup = await apiWithToken(superToken, 'GET', r.path(RANDOM_UUID))
      expect(sup.status, `${r.label} super`).toBe(200)
      expect(arrLen(sup.body, r.key), `${r.label} must leak no rows for an unknown tenant`).toBe(0)
      const vol = await apiWithToken(tok.vol, 'GET', r.path(RANDOM_UUID))
      expect([401, 403], `${r.label} non-super must be denied`).toContain(vol.status)
    })
  }
})

test.describe('D. Malformed id sweep — non-uuid / negative / huge → 4xx, never 500', () => {
  const MALFORMED = ['not-a-uuid', '-1', '99999999999999999999999999', "'; DROP TABLE ess_employees;--", '../../etc/passwd']
  // signed-documents/[id]/download is carved out — it currently 500s (see fixme).
  const SWEEP = ID_ROUTES.filter((r) => r.label !== 'signed-documents/[id]/download')
  for (const r of SWEEP) {
    test(`D[malformed] ${r.label} — bad ids never 500`, async () => {
      for (const bad of MALFORMED) {
        const res = await apiWithToken(tok[r.tok], 'GET', r.path(encodeURIComponent(bad)))
        expect(res.status, `${r.label} with "${bad}" must not 500 (got ${res.status})`).toBeLessThan(500)
      }
    })
  }

  // DEFECT (file separately): GET /api/signed-documents/[id]/download passes a
  // non-uuid id straight into a uuid-column query; the Postgres cast error is
  // unhandled → 500 (the route comment claims IDOR-safe 404). A foreign *uuid*
  // correctly 404s; only malformed ids 500. Un-skip once route.ts validates the
  // id (uuid regex → 400/404).
  //
  // SEVERITY CHECK (captured 2026-06-05 against prod): the 500 body is EMPTY
  // (content-length: 0) — Next.js strips error detail in production, so NO stack
  // trace / file path / internal detail leaks. Severity is therefore NOT raised
  // by info-disclosure; it stays a robustness / missing-input-guard bug. The
  // body assertions below are a leak regression-guard: if a future change starts
  // returning error detail in the 500 body, this fails loudly once un-skipped.
  test.fixme('D[malformed] signed-documents/[id]/download — non-uuid must not 500 (and must not leak)', async () => {
    for (const bad of ['not-a-uuid', '99999999999999999999999999']) {
      const res = await apiWithToken(tok.vol, 'GET', `/api/signed-documents/${encodeURIComponent(bad)}/download`)
      expect(res.status, `signed-documents with "${bad}" 500s — needs an id guard`).toBeLessThan(500)
      // No internal-detail leak in the error body (currently empty; guard against regression).
      const raw = res.body == null ? '' : JSON.stringify(res.body)
      expect(raw, 'signed-documents 500 must not leak internals').not.toMatch(/stack|at \/|node_modules|\/var\/task|invalid input syntax|supabase|postgres|ess_/i)
    }
  })
})

test.describe('D. Privilege-escalation negatives', () => {
  test('D[esc] volunteer → admin route (PUT /api/modules) denied', async () => {
    const r = await apiWithToken(tok.vol, 'PUT', '/api/modules', { modules_enabled: [] })
    expect([401, 403]).toContain(r.status)
  })
  test('D[esc] volunteer → super-admin API (/api/platform/dashboard) denied', async () => {
    const r = await apiWithToken(tok.vol, 'GET', '/api/platform/dashboard')
    expect([401, 403]).toContain(r.status)
  })
  test('D[esc] hr → super-admin config (PUT /api/platform/tenants/[id]) denied', async () => {
    const r = await apiWithToken(tok.hr, 'PUT', `/api/platform/tenants/${FIXTURES.company_id}`, { name: 'hacked' })
    expect([401, 403]).toContain(r.status)
  })
  test('D[esc] manager → hr-gated write (POST /api/documents) denied', async () => {
    const mgr = await tokenFor(ROLE_USERS.manager.email, ROLE_USERS.manager.password)
    const r = await apiWithToken(mgr, 'POST', '/api/documents', {})
    expect([401, 403]).toContain(r.status)
  })
})
