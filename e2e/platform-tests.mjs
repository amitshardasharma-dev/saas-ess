// E2E tests for the Platform super-admin area (/platform).
// Logs in as 'admin' (super_admin) and exercises pages + APIs.
// Negative security test logs in as 'employee' and asserts BLOCK.
//
// Run: cd /Volumes/ssd2/projects/saas-ess && node e2e/platform-tests.mjs

import { launch, loginAs, visit, apiGet } from './helper.mjs'
import { writeFileSync, mkdirSync } from 'fs'

const results = []
const add = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ::  ${detail}`)
}

// Authenticated mutating fetch (PUT/POST) using the bearer token in localStorage.
async function apiSend(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const t = localStorage.getItem('ess_access_token')
    const r = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(t ? { Authorization: 'Bearer ' + t } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    let data = null
    try { data = await r.json() } catch { data = null }
    return { status: r.status, ok: r.ok, body: data }
  }, { method, path, body })
}

const { browser, ctx } = await launch()
try {
  mkdirSync('/Volumes/ssd2/projects/saas-ess/e2e/shots', { recursive: true })

  // ===== Log in as super admin =====
  const { page, loginResult } = await loginAs(ctx, 'admin')
  add('admin login', loginResult.ok === true,
    `status=${loginResult.status} role=${loginResult.role}`)

  // ===================================================================
  // 1. PLATFORM DASHBOARD
  // ===================================================================
  {
    const api = await apiGet(page, '/api/platform/dashboard')
    const b = api.body || {}
    const hasShape = api.ok &&
      typeof b.total_tenants === 'number' &&
      typeof b.total_users === 'number' &&
      typeof b.over_limit_tenants === 'number' &&
      b.tenants_by_plan && b.tenants_by_status
    add('API /api/platform/dashboard', !!hasShape,
      `status=${api.status} tenants=${b.total_tenants} users=${b.total_users} over_limit=${b.over_limit_tenants} plans=${JSON.stringify(b.tenants_by_plan)}`)

    const v = await visit(page, '/platform', 'platform-dashboard')
    const txt = v.bodyText || ''
    const rendered = v.status === 200 &&
      /Platform Dashboard/i.test(txt) &&
      /Total Tenants/i.test(txt) &&
      /Total Users/i.test(txt)
    add('PAGE /platform renders', rendered && v.errors.length === 0,
      `status=${v.status} errors=${v.errors.length} hasHeading=${/Platform Dashboard/i.test(txt)} ${v.errors.slice(0,2).join(' | ')}`)
  }

  // ===================================================================
  // 2. TENANTS LIST + DETAIL
  // ===================================================================
  let tenantId = null
  let tenantName = null
  {
    const api = await apiGet(page, '/api/platform/tenants')
    const list = api.body?.tenants || []
    add('API /api/platform/tenants list', api.ok && Array.isArray(list) && list.length > 0,
      `status=${api.status} count=${list.length} names=${list.slice(0,8).map(t=>t.name).join(', ')}`)

    // grab a real tenant id (prefer Acme)
    const acme = list.find(t => /acme/i.test(t.name)) || list[0]
    if (acme) { tenantId = acme.id; tenantName = acme.name }

    const v = await visit(page, '/platform/tenants', 'platform-tenants-list')
    const txt = v.bodyText || ''
    const rendered = v.status === 200 && /Tenants/i.test(txt) &&
      (tenantName ? txt.includes(tenantName) : true)
    add('PAGE /platform/tenants renders', rendered && v.errors.length === 0,
      `status=${v.status} errors=${v.errors.length} listHasTenant=${tenantName ? txt.includes(tenantName) : 'n/a'} ${v.errors.slice(0,2).join(' | ')}`)
  }

  // Tenant detail (API + page)
  if (tenantId) {
    const api = await apiGet(page, `/api/platform/tenants/${tenantId}`)
    const t = api.body?.tenant || {}
    const hasShape = api.ok && t.id === tenantId && typeof t.name === 'string' &&
      Array.isArray(t.modules_enabled) && typeof t.user_count === 'number'
    add('API /api/platform/tenants/[id] detail', !!hasShape,
      `status=${api.status} name=${t.name} plan=${t.plan} modules=${JSON.stringify(t.modules_enabled)} users=${t.user_count}`)

    const v = await visit(page, `/platform/tenants/${tenantId}`, 'platform-tenant-detail')
    const txt = v.bodyText || ''
    // Module config panel + Terminology panel both render on detail page
    const modulePanel = /Toggle which modules are enabled/i.test(txt) || /Modules/i.test(txt)
    const termPanel = /Terminology/i.test(txt)
    add('PAGE /platform/tenants/[id] renders', v.status === 200 && v.errors.length === 0,
      `status=${v.status} errors=${v.errors.length} ${v.errors.slice(0,2).join(' | ')}`)
    add('Module-config panel renders (Phase 1)', modulePanel,
      `moduleHeadingFound=${modulePanel}`)
    add('Terminology panel renders (Phase 1)', termPanel,
      `terminologyHeadingFound=${termPanel}`)
  } else {
    add('API /api/platform/tenants/[id] detail', false, 'no tenant id available')
    add('PAGE /platform/tenants/[id] renders', false, 'no tenant id available')
    add('Module-config panel renders (Phase 1)', false, 'no tenant id available')
    add('Terminology panel renders (Phase 1)', false, 'no tenant id available')
  }

  // ===================================================================
  // 3. MODULE TOGGLES + DEPENDENCY VALIDATION + TERMINOLOGY (Phase 1)
  // ===================================================================
  if (tenantId) {
    // 3a. Dependency validation: enabling 'quizzes' WITHOUT 'training' must 409.
    const bad = await apiSend(page, 'PUT', `/api/platform/tenants/${tenantId}`, {
      modules_enabled: ['leave', 'expense', 'quizzes'], // quizzes requires training
    })
    add('Module dependency validation (quizzes w/o training -> 409)',
      bad.status === 409,
      `status=${bad.status} error=${bad.body?.error || ''}`)

    // 3b. Valid toggle: enable training+quizzes together should succeed (200).
    const good = await apiSend(page, 'PUT', `/api/platform/tenants/${tenantId}`, {
      modules_enabled: ['leave', 'expense', 'training', 'quizzes'],
    })
    add('Module toggle valid set (training+quizzes -> success)',
      good.status === 200 && good.body?.success === true,
      `status=${good.status} body=${JSON.stringify(good.body)}`)

    // verify persisted
    const after = await apiGet(page, `/api/platform/tenants/${tenantId}`)
    const mods = after.body?.tenant?.modules_enabled || []
    add('Module toggle persisted',
      mods.includes('training') && mods.includes('quizzes'),
      `modules_enabled=${JSON.stringify(mods)}`)

    // 3c. Restore a safe baseline (leave + expense) to avoid polluting tenant.
    const restore = await apiSend(page, 'PUT', `/api/platform/tenants/${tenantId}`, {
      modules_enabled: ['leave', 'expense'],
    })
    console.log(`  (restore modules baseline status=${restore.status})`)

    // 3d. Terminology override via PUT /labels (valid key 'person')
    const term = await apiSend(page, 'PUT', `/api/platform/tenants/${tenantId}/labels`, {
      termKey: 'person', singular: 'Team Member', plural: 'Team Members',
    })
    const termOk = term.status === 200 || term.status === 201
    add('Terminology override PUT /labels', termOk,
      `status=${term.status} body=${JSON.stringify(term.body)}`)

    // verify it reads back
    const labelsGet = await apiGet(page, `/api/platform/tenants/${tenantId}/labels`)
    const overrides = labelsGet.body?.overrides || []
    const found = overrides.find(o => o.term_key === 'person')
    add('Terminology override persisted (GET /labels)',
      labelsGet.ok && !!found && found.singular === 'Team Member',
      `status=${labelsGet.status} found=${JSON.stringify(found)}`)

    // 3e. Bad term key should 400 (validation)
    const badTerm = await apiSend(page, 'PUT', `/api/platform/tenants/${tenantId}/labels`, {
      termKey: 'not_a_real_term', singular: 'x', plural: 'y',
    })
    add('Terminology rejects unknown term key (-> 400)',
      badTerm.status === 400,
      `status=${badTerm.status} error=${badTerm.body?.error || ''}`)
  } else {
    add('Module dependency validation (quizzes w/o training -> 409)', false, 'no tenant id')
    add('Module toggle valid set (training+quizzes -> success)', false, 'no tenant id')
    add('Module toggle persisted', false, 'no tenant id')
    add('Terminology override PUT /labels', false, 'no tenant id')
    add('Terminology override persisted (GET /labels)', false, 'no tenant id')
    add('Terminology rejects unknown term key (-> 400)', false, 'no tenant id')
  }

  // ===================================================================
  // 4. PLANS
  // ===================================================================
  {
    const api = await apiGet(page, '/api/platform/plans')
    const plans = api.body?.plans || []
    add('API /api/platform/plans', api.ok && Array.isArray(plans),
      `status=${api.status} count=${plans.length} slugs=${plans.map(p=>p.slug).join(', ')}`)

    const v = await visit(page, '/platform/plans', 'platform-plans')
    const txt = v.bodyText || ''
    add('PAGE /platform/plans renders', v.status === 200 && /Plans/i.test(txt) && v.errors.length === 0,
      `status=${v.status} errors=${v.errors.length} ${v.errors.slice(0,2).join(' | ')}`)
  }

  // ===================================================================
  // 5. ANNOUNCEMENTS
  // ===================================================================
  {
    const api = await apiGet(page, '/api/platform/announcements')
    const anns = api.body?.announcements
    add('API /api/platform/announcements', api.ok && Array.isArray(anns),
      `status=${api.status} count=${Array.isArray(anns) ? anns.length : 'n/a'}`)

    const v = await visit(page, '/platform/announcements', 'platform-announcements')
    const txt = v.bodyText || ''
    add('PAGE /platform/announcements renders', v.status === 200 && /Announcements/i.test(txt) && v.errors.length === 0,
      `status=${v.status} errors=${v.errors.length} ${v.errors.slice(0,2).join(' | ')}`)
  }

  await page.close()

  // ===================================================================
  // 6. NEGATIVE / SECURITY TEST — non-super user must be BLOCKED
  // ===================================================================
  {
    const emp = await loginAs(ctx, 'employee')
    const ep = emp.page
    console.log(`  (employee login status=${emp.loginResult.status} role=${emp.loginResult.role})`)

    // 6a. API must return 403 (not data) for super-admin-gated endpoints.
    const apiDash = await apiGet(ep, '/api/platform/dashboard')
    const apiTenants = await apiGet(ep, '/api/platform/tenants')
    const apiAnns = await apiGet(ep, '/api/platform/announcements')

    const dashBlocked = apiDash.status === 403 || apiDash.status === 401
    const tenantsBlocked = apiTenants.status === 403 || apiTenants.status === 401
    const annsBlocked = apiAnns.status === 403 || apiAnns.status === 401
    // Critical: ensure no real data leaked
    const noDataLeak =
      !(apiDash.body?.total_tenants) &&
      !(Array.isArray(apiTenants.body?.tenants) && apiTenants.body.tenants.length) &&
      !(Array.isArray(apiAnns.body?.announcements) && apiAnns.body.announcements.length)

    add('SECURITY: employee BLOCKED from /api/platform/dashboard',
      dashBlocked && !apiDash.body?.total_tenants,
      `status=${apiDash.status} bodyKeys=${Object.keys(apiDash.body||{}).join(',')}`)
    add('SECURITY: employee BLOCKED from /api/platform/tenants',
      tenantsBlocked && !(apiTenants.body?.tenants?.length),
      `status=${apiTenants.status} tenantsReturned=${apiTenants.body?.tenants?.length ?? 0}`)
    add('SECURITY: employee BLOCKED from /api/platform/announcements',
      annsBlocked,
      `status=${apiAnns.status}`)
    add('SECURITY: no platform data leaked to employee', noDataLeak,
      `dashHasData=${!!apiDash.body?.total_tenants} tenantsLeaked=${apiTenants.body?.tenants?.length ?? 0}`)

    // 6b. Page must redirect away (not show platform admin UI).
    const v = await visit(ep, '/platform', 'platform-employee-blocked')
    const txt = v.bodyText || ''
    const finalUrl = ep.url()
    // Layout redirects non-super to /dashboard; should NOT show "Platform Dashboard" stats.
    const showsPlatformAdmin = /Platform Admin/i.test(txt) && /Super Admin Panel/i.test(txt) && /Total Tenants/i.test(txt)
    const redirectedOrBlocked = !finalUrl.endsWith('/platform') || /Verifying admin access/i.test(txt) || !showsPlatformAdmin
    add('SECURITY: employee page /platform redirected/blocked (no admin UI)',
      redirectedOrBlocked && !/Total Tenants/i.test(txt),
      `finalUrl=${finalUrl} showsStats=${/Total Tenants/i.test(txt)} txt="${txt.slice(0,120).replace(/\n+/g,' ')}"`)

    await ep.close()
  }
} catch (err) {
  add('FATAL harness error', false, String(err?.stack || err))
} finally {
  await browser.close()
}

// ===== Save results =====
mkdirSync('/Volumes/ssd2/projects/saas-ess/e2e/results', { recursive: true })
writeFileSync(
  '/Volumes/ssd2/projects/saas-ess/e2e/results/platform.json',
  JSON.stringify(results, null, 2)
)

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== PLATFORM RESULTS: ${passed} pass / ${failed} fail =====`)
process.exit(failed > 0 ? 1 : 0)
