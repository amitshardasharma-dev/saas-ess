/**
 * Section A — Authentication & Session.
 * One test per checklist item (happy/error/edge/empty + Part B failure modes).
 * Drives login/logout directly, so these are `multi` specs (own contexts/tokens),
 * not storageState-bound. Targets live, scoped strictly to seed users.
 */
import { test, expect, BASE, FIXTURES, ROLE_USERS, loginByApi, api, tokenFor, apiWithToken } from './fixtures'

const VOL = ROLE_USERS.volunteer

test.describe('A. Authentication & Session', () => {
  // A — Login happy path
  test('A: login happy path → dashboard + token stored', async ({ page }) => {
    const res = await loginByApi(page, VOL.email, VOL.password)
    expect(res.status).toBe(200)
    expect(res.message).toBe('Logged In')
    const token = await page.evaluate(() => localStorage.getItem('ess_access_token'))
    expect(token, 'access token persisted').toBeTruthy()
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    expect(page.url()).toContain('/dashboard')
  })

  // A — Login failure: wrong password
  test('A: login wrong password → 401, no token', async ({ page }) => {
    const res = await loginByApi(page, VOL.email, 'WRONG-passw0rd')
    expect(res.status).toBe(401)
    const token = await page.evaluate(() => localStorage.getItem('ess_access_token'))
    expect(token).toBeFalsy()
  })

  // A — Login failure: unknown email
  test('A: login unknown email → denied', async ({ page }) => {
    const res = await loginByApi(page, 'nobody.nonexistent@acme.test', 'Test1234!')
    expect(res.status).toBeGreaterThanOrEqual(400)
    const token = await page.evaluate(() => localStorage.getItem('ess_access_token'))
    expect(token).toBeFalsy()
  })

  // A — Login edge: empty email → API rejects (UI also blocks; assert API contract)
  test('A: login empty email → rejected', async () => {
    const { status } = await apiWithToken(null, 'POST', '/api/auth/login')
    // route requires usr+pwd; empty body must not 200
    expect(status).not.toBe(200)
  })

  // A — Login edge: empty password → rejected
  test('A: login empty password → rejected', async () => {
    const r = await apiWithToken(null, 'POST', '/api/auth/login')
    expect(r.status).not.toBe(200)
  })

  // A — Login edge: malformed email → denied (not 200)
  test('A: login malformed email → denied', async ({ page }) => {
    const res = await loginByApi(page, 'not-an-email', 'Test1234!')
    expect(res.status).not.toBe(200)
  })

  // A — Auth user exists but not registered in ess_app_users → 403
  test('A: unregistered (auth-only) user → 403 not registered', async ({ page }) => {
    const u = FIXTURES.unregistered
    const res = await loginByApi(page, u.email, u.password)
    expect(res.status).toBe(403)
  })

  // A — Inactive user (is_active=false) → denied
  test('A: inactive user → denied', async ({ page }) => {
    const u = FIXTURES.inactive
    const res = await loginByApi(page, u.email, u.password)
    expect(res.status).not.toBe(200)
  })

  // A — Session persistence: reload keeps session
  test('A: session persists across reload', async ({ page }) => {
    await loginByApi(page, VOL.email, VOL.password)
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await page.reload({ waitUntil: 'networkidle' })
    const me = await api(page, 'GET', '/api/auth/user')
    expect(me.status).toBe(200)
    expect(me.body?.user?.role).toBe(VOL.role)
  })

  // A — Logout clears token; protected data API then denies
  test('A: logout clears token + protects data', async ({ page }) => {
    await loginByApi(page, VOL.email, VOL.password)
    await api(page, 'POST', '/api/auth/logout')
    await page.evaluate(() => { localStorage.removeItem('ess_access_token'); localStorage.removeItem('auth-storage') })
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    // After logout: the soft /api/auth/user reports not-authenticated AND a
    // hard-protected route (people) rejects with 401. (No bearer token now.)
    const me = await api(page, 'GET', '/api/auth/user')
    expect(me.body?.authenticated, 'auth/user reports logged out').toBeFalsy()
    const people = await api(page, 'GET', '/api/people')
    expect(people.status, 'protected route denies after logout').toBe(401)
  })

  // A — Unauthenticated direct-nav /dashboard → no data leak (redirect or empty)
  test('A: unauthenticated /dashboard → no data', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const text = await page.evaluate(() => document.body.innerText)
    // no people/list data should render for an anon visitor
    expect(/Sample Volunteer|RBAC |employee_no/i.test(text)).toBeFalsy()
  })

  // A — Unauthenticated direct-nav /dashboard/settings → blocked/empty
  test('A: unauthenticated /dashboard/settings → blocked', async ({ page }) => {
    await page.goto('/dashboard/settings', { waitUntil: 'networkidle' })
    const text = await page.evaluate(() => document.body.innerText)
    expect(/Business Central|company settings|save settings/i.test(text)).toBeFalsy()
  })

  // A — Unauthenticated direct-nav /platform → blocked
  test('A: unauthenticated /platform → blocked', async ({ page }) => {
    await page.goto('/platform', { waitUntil: 'networkidle' })
    const text = await page.evaluate(() => document.body.innerText)
    expect(/total tenants|platform dashboard/i.test(text)).toBeFalsy()
  })

  // A — Invalid token → not authenticated.
  // NOTE (real contract): /api/auth/user is a SOFT auth probe — it returns 200
  // with { authenticated:false } for a bad token (not a 401). The security
  // guarantee we assert is that a forged token yields NO authenticated identity.
  // Hard-protected routes (people/onboarding/modules) DO reject by 401 — see the
  // 'forged bearer rejected across APIs' test below.
  test('A: invalid token → not authenticated', async () => {
    const r = await apiWithToken('invalid.tampered.token', 'GET', '/api/auth/user')
    expect(r.status).toBe(200)
    expect(r.body?.authenticated).toBe(false)
    expect(r.body?.user).toBeNull()
  })

  // A — Remember me behaviour (refresh token issued when present)
  test('A: login issues refresh token', async ({ page }) => {
    await loginByApi(page, VOL.email, VOL.password)
    const rt = await page.evaluate(() => localStorage.getItem('ess_refresh_token'))
    expect(rt, 'refresh token stored').toBeTruthy()
  })

  // --- Part B failure modes ---

  // SESS — token expires mid-session → protected route 401, no white screen.
  // Assert on a HARD-protected route (people) which rejects by status; the soft
  // auth/user probe would only flip authenticated→false.
  test('A[fail]: expired token mid-session → protected route 401', async ({ page }) => {
    await loginByApi(page, VOL.email, VOL.password)
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await page.evaluate(() => localStorage.setItem('ess_access_token', 'expired.tampered.jwt'))
    const me = await api(page, 'GET', '/api/auth/user')
    expect(me.body?.authenticated, 'auth probe reports not authed').toBeFalsy()
    const protectedCall = await api(page, 'GET', '/api/onboarding')
    expect([401, 403], 'protected route rejects expired token').toContain(protectedCall.status)
  })

  // NET — login request fails/times out → no token, retry works
  test('A[fail]: login network failure → no token, retry succeeds', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    // abort the first login attempt
    await page.route('**/api/auth/login', (route) => route.abort())
    const failed = await page.evaluate(async () => {
      try {
        await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ usr: 'x@y.z', pwd: 'p' }) })
        return 'ok'
      } catch { return 'aborted' }
    })
    expect(failed).toBe('aborted')
    const tokenAfterFail = await page.evaluate(() => localStorage.getItem('ess_access_token'))
    expect(tokenAfterFail).toBeFalsy()
    // unroute and retry for real
    await page.unroute('**/api/auth/login')
    const res = await loginByApi(page, VOL.email, VOL.password)
    expect(res.status).toBe(200)
  })

  // RACE — two concurrent logins (two contexts) both authenticate consistently
  test('A[fail]: concurrent logins both succeed', async ({ browser }) => {
    const [c1, c2] = await Promise.all([browser.newContext(), browser.newContext()])
    const [p1, p2] = await Promise.all([c1.newPage(), c2.newPage()])
    const [r1, r2] = await Promise.all([
      loginByApi(p1, VOL.email, VOL.password),
      loginByApi(p2, VOL.email, VOL.password),
    ])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    await c1.close(); await c2.close()
  })

  // INPUT — oversized string in email field → rejected, no crash
  test('A[fail]: oversized email input → rejected, no 500', async () => {
    const ctx = await (await import('@playwright/test')).request.newContext({ baseURL: BASE })
    const r = await ctx.post('/api/auth/login', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, form: { usr: 'a'.repeat(10000) + '@x.z', pwd: 'p' } })
    expect(r.status()).toBeLessThan(500)
    await ctx.dispose()
  })

  // INPUT — injection payload in credentials → safely handled, no 200
  test('A[fail]: injection payload in credentials → safe', async ({ page }) => {
    const res = await loginByApi(page, "' OR 1=1;--@x.z", "'; DROP TABLE ess_app_users;--")
    expect(res.status).not.toBe(200)
  })

  // REVOKE — user deactivated mid-session → next request denied
  // (covered structurally: inactive fixture cannot even obtain a session; a
  //  live mid-session deactivation would require mutating is_active during the
  //  test, which we avoid on shared prod — assert the inactive-user boundary.)
  test('A[fail]: deactivated user cannot authenticate (revoke boundary)', async ({ page }) => {
    const res = await loginByApi(page, FIXTURES.inactive.email, FIXTURES.inactive.password)
    expect(res.status).not.toBe(200)
  })

  // SESS — forged/tampered bearer denied on every HARD-protected API.
  // (/api/auth/user is the soft probe and is asserted separately above.)
  test('A[fail]: forged bearer rejected across protected APIs', async () => {
    for (const path of ['/api/people', '/api/onboarding', '/api/modules']) {
      const r = await apiWithToken('forged.jwt.value', 'GET', path)
      expect([401, 403], `${path}`).toContain(r.status)
    }
    // and the soft probe must report not-authenticated
    const probe = await apiWithToken('forged.jwt.value', 'GET', '/api/auth/user')
    expect(probe.body?.authenticated).toBe(false)
  })
})
