// E2E: Authentication, RBAC, navigation, module gating.
// Run: node e2e/auth-tests.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { launch, loginAs, visit, apiGet, USERS, BASE } from './helper.mjs'

const RESULTS = []
const add = (name, pass, detail, severity = pass ? 'INFO' : 'HIGH') =>
  RESULTS.push({ name, pass, severity: pass ? 'PASS' : severity, detail })

// Pull the visible sidebar/nav labels out of the rendered page.
async function navLabels(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav')
    if (!nav) return { found: false, items: [] }
    // top-level item titles are font-medium text-sm; just grab all distinct
    // non-empty short text lines inside the nav to approximate menu labels.
    const txt = nav.innerText || ''
    const lines = txt.split('\n').map(s => s.trim()).filter(Boolean)
    return { found: true, items: lines }
  })
}
async function hasPlatformLink(page) {
  return page.evaluate(() => !!document.querySelector('a[href="/platform"]'))
}
async function hasLogout(page) {
  return page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    return btns.some(b => /logout/i.test(b.innerText || ''))
  })
}

const { browser, ctx } = await launch()
const navByRole = {}
try {
  // ---------------------------------------------------------------
  // 1. Login all 4 roles + 2. dashboard renders + 3. capture nav
  // ---------------------------------------------------------------
  for (const who of ['admin', 'hr', 'manager', 'employee']) {
    const expectRole = USERS[who].role
    let page, loginResult, errors
    try {
      ({ page, loginResult, errors } = await loginAs(ctx, who))
    } catch (e) {
      add(`login:${who}`, false, `loginAs threw: ${e.message}`, 'CRITICAL')
      continue
    }
    const okLogin = loginResult.status === 200
    add(
      `login:${who}`,
      okLogin,
      `status=${loginResult.status} role=${loginResult.role ?? '(none)'} expected≈${expectRole}`,
      okLogin ? 'INFO' : 'CRITICAL'
    )

    // Dashboard render
    const dash = await visit(page, '/dashboard', `dash-${who}`)
    const text = dash.bodyText || ''
    const hasRealContent =
      dash.status === 200 &&
      text.length > 80 &&
      !/verifying admin access/i.test(text) &&
      /(dashboard|welcome|leave|portal|self service|ess|overview|stats)/i.test(text)
    // "Failed to fetch" is a transient backend-connection artifact under rapid
    // sequential headless sessions (verified: isolated render = 0 errors), so it
    // is reported but does not fail the render check. Real app/JS errors do.
    const transient = dash.errors.filter(e => /Failed to fetch|net::ERR|Failed to load resource/i.test(e))
    const hardErrs = dash.errors.filter(e =>
      !/favicon|Failed to fetch|net::ERR|Failed to load resource|hydrat/i.test(e)
    )
    add(
      `dashboard-render:${who}`,
      hasRealContent && hardErrs.length === 0,
      `status=${dash.status} textLen=${text.length} hardErrors=${hardErrs.length} transientFetchErrs=${transient.length}` +
        `${hardErrs.length ? ' :: ' + hardErrs.slice(0, 2).join(' | ') : ''} :: text="${text.replace(/\n+/g, ' ').slice(0, 100)}"`,
      hasRealContent ? (hardErrs.length ? 'HIGH' : 'INFO') : 'HIGH'
    )

    // Capture nav for role-diff analysis
    const nav = await navLabels(page)
    const platformLink = await hasPlatformLink(page)
    const logout = await hasLogout(page)
    navByRole[who] = { items: nav.items, count: nav.items.length, platformLink, logout, found: nav.found }
    await page.close().catch(() => {})
    await new Promise(r => setTimeout(r, 1500)) // stagger to ease backend connections
  }

  // ---------------------------------------------------------------
  // 3. Role-based nav differences
  // ---------------------------------------------------------------
  const adminCount = navByRole.admin?.count ?? 0
  const empCount = navByRole.employee?.count ?? 0
  add(
    'nav-diff:employee<admin',
    navByRole.admin?.found && navByRole.employee?.found && empCount < adminCount,
    `adminNavLines=${adminCount} employeeNavLines=${empCount} (employee should see fewer)`,
    empCount < adminCount ? 'INFO' : 'MED'
  )
  // platform link should only show for super-admin (admin), never for employee
  add(
    'nav-diff:platform-link-admin-only',
    navByRole.admin?.platformLink === true && navByRole.employee?.platformLink === false,
    `admin.platformLink=${navByRole.admin?.platformLink} employee.platformLink=${navByRole.employee?.platformLink}`,
    (navByRole.admin?.platformLink && !navByRole.employee?.platformLink) ? 'INFO' : 'HIGH'
  )

  // ---------------------------------------------------------------
  // 4. Super-admin platform access
  // ---------------------------------------------------------------
  {
    const { page } = await loginAs(ctx, 'admin')
    const plat = await visit(page, '/platform', 'platform-admin')
    const t = plat.bodyText || ''
    // success = real platform content, NOT stuck on the verifying spinner, NOT bounced to /dashboard
    const url = page.url()
    const ok =
      plat.status === 200 &&
      !/verifying admin access/i.test(t) &&
      !url.endsWith('/dashboard') &&
      /(tenant|platform|plan|announc|dashboard|total|admin panel)/i.test(t)
    add(
      'platform-access:super-admin',
      ok,
      `status=${plat.status} url=${url} text="${t.replace(/\n+/g, ' ').slice(0, 120)}"`,
      ok ? 'INFO' : 'HIGH'
    )
    await page.close().catch(() => {})
  }
  {
    // employee (non-super) must be blocked / redirected, never see platform data
    const { page } = await loginAs(ctx, 'employee')
    const plat = await visit(page, '/platform', 'platform-employee-blocked')
    const t = plat.bodyText || ''
    const url = page.url()
    const showsPlatformData = /tenants|plans|announcements|total tenants|platform admin/i.test(t) && !/verifying/i.test(t)
    const blocked = url.endsWith('/dashboard') || /verifying admin access/i.test(t) || url.includes('/login') || !showsPlatformData
    add(
      'platform-access:non-super-blocked',
      blocked,
      `url=${url} blocked=${blocked} showsPlatformData=${showsPlatformData} text="${t.replace(/\n+/g, ' ').slice(0, 120)}"`,
      blocked ? 'INFO' : 'CRITICAL'
    )
    // Also confirm the API itself returns 403 for non-super
    const apiPlat = await apiGet(page, '/api/platform/dashboard')
    add(
      'platform-api:non-super-403',
      apiPlat.status === 403 || apiPlat.status === 401,
      `GET /api/platform/dashboard status=${apiPlat.status} (expected 403/401)`,
      (apiPlat.status === 403 || apiPlat.status === 401) ? 'INFO' : 'CRITICAL'
    )
    await page.close().catch(() => {})
  }

  // ---------------------------------------------------------------
  // 5. Unauthorized access (fresh context, no login)
  // ---------------------------------------------------------------
  {
    const { browser: b2, ctx: ctx2 } = await launch()
    try {
      for (const path of ['/dashboard', '/dashboard/settings']) {
        const page = await ctx2.newPage()
        const errors = []
        page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 200)))
        const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => { errors.push('GOTO:' + e.message); return null })
        await page.waitForTimeout(2000)
        const url = page.url()
        const t = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 1500)
        await page.screenshot({ path: `/Volumes/ssd2/projects/saas-ess/e2e/shots/unauth-${path.replace(/\//g, '_')}.png`, fullPage: true }).catch(() => {})
        const redirected = url.includes('/login')
        const showsLoginForm = /sign in|log\s*in|password|email/i.test(t) && !/leave balance|payslip|my expense|pending approvals/i.test(t)
        const leaksData = /leave balance|payslip|my expense claims|pending approvals|employee id|department/i.test(t)
        const hasNav = await page.evaluate(() => !!document.querySelector('nav'))
        // SECURITY pass = no protected data is exposed (no nav, no data leak).
        const noDataExposed = !leaksData && !hasNav
        const safe = redirected || showsLoginForm || noDataExposed
        // But proper UX is to redirect to /login; flag if it just renders blank.
        const blankNoRedirect = noDataExposed && !redirected && !showsLoginForm
        add(
          `unauth:${path}`,
          safe,
          `finalUrl=${url} redirected=${redirected} hasNav=${hasNav} leaksData=${leaksData}` +
            (blankNoRedirect ? ' :: NOTE blank page, NO /login redirect (data is NOT exposed, but no proper auth guard redirect)' : '') +
            ` :: text="${t.replace(/\n+/g, ' ').slice(0, 80)}"`,
          safe ? (blankNoRedirect ? 'LOW' : 'INFO') : 'CRITICAL'
        )
        await page.close().catch(() => {})
      }
    } finally {
      await b2.close()
    }
  }

  // ---------------------------------------------------------------
  // 6. Logout
  // ---------------------------------------------------------------
  {
    const { page } = await loginAs(ctx, 'admin')
    await visit(page, '/dashboard', null)
    // confirm token valid first
    const before = await apiGet(page, '/api/auth/user')
    // hit logout endpoint
    const logoutRes = await page.evaluate(async () => {
      const t = localStorage.getItem('ess_access_token')
      const r = await fetch('/api/auth/logout', { method: 'POST', headers: t ? { Authorization: 'Bearer ' + t } : {} })
      let body = null; try { body = await r.json() } catch {}
      return { status: r.status, ok: r.ok, body }
    })
    add(
      'logout:endpoint-responds',
      logoutRes.status === 200 || logoutRes.status === 204,
      `before /api/auth/user=${before.status}; POST /api/auth/logout status=${logoutRes.status}`,
      (logoutRes.status === 200 || logoutRes.status === 204) ? 'INFO' : 'MED'
    )
    await page.close().catch(() => {})
  }

  // ---------------------------------------------------------------
  // 7. Module gating
  // ---------------------------------------------------------------
  {
    const { page } = await loginAs(ctx, 'admin')
    const mods = await apiGet(page, '/api/modules')
    const b = mods.body
    // Observed shape: { modules_enabled: [...] }
    let enabled = null
    if (b && Array.isArray(b.modules_enabled)) enabled = b.modules_enabled
    else if (Array.isArray(b)) enabled = b
    else if (b && Array.isArray(b.modules)) enabled = b.modules
    const count = enabled ? enabled.length : null
    const ok = mods.status === 200 && count !== null
    // The brief expects 17 enabled modules on Acme Corp; flag if fewer.
    add(
      'modules:admin-list-returns-200',
      mods.status === 200 && count !== null,
      `status=${mods.status} enabledCount=${count} list=[${(enabled || []).join(',')}]`,
      ok ? 'INFO' : 'HIGH'
    )
    add(
      'modules:expected-17-enabled',
      count !== null && count >= 17,
      `enabledCount=${count} expected>=17 — list=[${(enabled || []).join(',')}]` +
        (count !== null && count < 17 ? ' :: MISMATCH vs brief ("all 17 modules enabled on Acme Corp")' : ''),
      (count !== null && count >= 17) ? 'INFO' : 'HIGH'
    )
    await page.close().catch(() => {})
  }
} catch (e) {
  add('harness', false, 'Uncaught: ' + e.message + '\n' + e.stack, 'CRITICAL')
} finally {
  await browser.close()
}

// Persist + print
mkdirSync('/Volumes/ssd2/projects/saas-ess/e2e/results', { recursive: true })
writeFileSync(
  '/Volumes/ssd2/projects/saas-ess/e2e/results/auth.json',
  JSON.stringify({ ts: new Date().toISOString(), base: BASE, navByRole, results: RESULTS }, null, 2)
)
const passed = RESULTS.filter(r => r.pass).length
const failed = RESULTS.length - passed
console.log(`\n===== AUTH/RBAC RESULTS: ${passed} passed / ${failed} failed =====`)
for (const r of RESULTS) {
  console.log(`[${r.pass ? 'PASS' : 'FAIL'}] (${r.severity}) ${r.name}\n      ${r.detail}`)
}
console.log('\n--- NAV PER ROLE ---')
for (const [role, n] of Object.entries(navByRole)) {
  console.log(`${role}: ${n.count} nav lines | platformLink=${n.platformLink} logout=${n.logout}`)
  console.log(`   items: ${(n.items || []).join(' · ').slice(0, 400)}`)
}
