// Agent B — Role-Based Access Control E2E suite (live: https://saas-ess.vercel.app)
// Four tiers: super_admin (admin+is_super_admin), admin (role=admin),
// staff (role=hr), volunteer (role=employee).
//
// Philosophy: a "denied" claim is only PASS when BOTH the UI surface is
// withheld (nav item hidden OR route redirected) AND the underlying
// API/route rejects the action with 401/403. We never trust a missing
// menu item alone.
//
// Run: cd /Volumes/ssd2/projects/saas-ess && node tests/agentB.mjs

import {
  launch,
  loginRole,
  apiAs,
  gotoApp,
  shot,
  Recorder,
  FIXTURES,
  BASE,
} from './helpers/harness.mjs'

const AGENT = 'agentB'
const COMPANY_ID = FIXTURES.company_id
const rec = new Recorder(AGENT)

// ---- small helpers -------------------------------------------------------

// Is a nav GROUP/ITEM with the exact label visible in the sidebar?
// The sidebar renders top-level groups as collapsible buttons (no <a href>
// on the label), so we match the rendered label line inside <nav>. We use an
// exact line match to avoid false positives (e.g. Profile's "Account settings"
// description must NOT count as the admin-only "Settings" group).
// Caller must already be on /dashboard with the nav rendered.
async function navHasLabel(page, label) {
  return page
    .evaluate((lbl) => {
      const nav = document.querySelector('nav')
      if (!nav) return false
      const lines = (nav.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      const re = new RegExp(`^${lbl}$`, 'i')
      return lines.some((l) => re.test(l))
    }, label)
    .catch(() => false)
}

// Does page text mention an access/permission denial?
function looksDenied(text) {
  return /access denied|insufficient|not authorized|unauthorized|forbidden|don't have permission|do not have permission/i.test(
    text || ''
  )
}

// A redirect away from a protected route counts as "blocked".
function redirectedAway(url, protectedPath) {
  try {
    const u = new URL(url)
    return !u.pathname.startsWith(protectedPath)
  } catch {
    return true
  }
}

function ok(b) {
  return b ? 'OK' : 'FAIL'
}

// Wrap a scenario so an exception is recorded, not swallowed.
async function run(id, useCase, fn) {
  rec.start(id, useCase)
  try {
    await fn()
  } catch (e) {
    rec.fail(e)
    console.error(`  !! ${id} threw:`, e && e.message)
  }
  const s = rec.scenarios[rec.scenarios.length - 1]
  console.log(`  [${id}] ${s.pass ? 'PASS' : 'FAIL'}`)
}

// =========================================================================

const { browser, ctx } = await launch()

try {
  // -------------------------------------------------------------------
  // B1 — Super Admin full access
  // -------------------------------------------------------------------
  await run('B1', 'Super Admin: full access — view all, edit profile (persists), open system config', async () => {
    const { page } = await loginRole(ctx, AGENT, 'super_admin')
    rec.step('Logged in as super_admin')

    // View all records
    const people = await apiAs(page, 'GET', '/api/people')
    rec.step(`GET /api/people -> ${people.status}`)

    // Platform (super-admin-only) API
    const plat = await apiAs(page, 'GET', '/api/platform/dashboard')
    rec.step(`GET /api/platform/dashboard -> ${plat.status}`)

    // Edit own profile and assert it persists
    const stamp = `B1-${Date.now()}`
    const upd = await apiAs(page, 'POST', '/api/profile/update', { updates: { phone: stamp } })
    rec.step(`POST /api/profile/update phone=${stamp} -> ${upd.status}`)
    const persisted = upd.status === 200 && upd.body?.employee?.phone === stamp
    rec.step(`profile persisted = ${persisted} (got phone=${upd.body?.employee?.phone})`)

    // Open /platform UI (super-admin only) — should load real stats
    const platUi = await gotoApp(page, '/platform')
    rec.addShot(await shot(page, AGENT, 'B1', 'platform-ui'))
    const platLoaded = platUi.url.includes('/platform') && !looksDenied(platUi.text)
    rec.step(`/platform UI url=${platUi.url} loaded=${platLoaded}`)

    // Open settings UI
    const setUi = await gotoApp(page, '/dashboard/settings')
    rec.addShot(await shot(page, AGENT, 'B1', 'settings-ui'))
    const setLoaded = setUi.url.includes('/dashboard/settings') && !looksDenied(setUi.text)
    rec.step(`/dashboard/settings UI url=${setUi.url} loaded=${setLoaded}`)

    rec.expect('people=200, platform=200, profile persists, /platform + settings UI load')
    const pass =
      people.status === 200 &&
      plat.status === 200 &&
      persisted &&
      platLoaded &&
      setLoaded
    rec.finish(
      pass,
      `people=${people.status}, platform=${plat.status}, profilePersist=${persisted}, platformUI=${ok(platLoaded)}, settingsUI=${ok(setLoaded)}`
    )
    await page.close()
  })

  // -------------------------------------------------------------------
  // B2 — Admin: full company config, but NOT platform/tenant config
  // -------------------------------------------------------------------
  await run('B2', 'Admin: company config allowed; platform/tenant config denied (vs Super Admin)', async () => {
    const { page } = await loginRole(ctx, AGENT, 'admin')
    rec.step('Logged in as admin (role=admin, is_super_admin=false)')

    // ALLOWED: view all
    const people = await apiAs(page, 'GET', '/api/people')
    rec.step(`GET /api/people -> ${people.status} (expect 200)`)

    // ALLOWED: company module config (admin)
    const modPut = await apiAs(page, 'PUT', '/api/modules', { moduleId: 'leave', enabled: true })
    rec.step(`PUT /api/modules leave=on -> ${modPut.status} (expect 200)`)

    // ALLOWED: settings UI loads + nav shows Settings group
    const setUi = await gotoApp(page, '/dashboard/settings')
    rec.addShot(await shot(page, AGENT, 'B2', 'settings-ui'))
    await gotoApp(page, '/dashboard')
    const navSettings = await navHasLabel(page, 'Settings')
    rec.step(`/dashboard/settings url=${setUi.url} navSettings=${navSettings}`)

    // DENIED: platform API (super-admin only)
    const plat = await apiAs(page, 'GET', '/api/platform/dashboard')
    rec.step(`GET /api/platform/dashboard -> ${plat.status} (expect 403)`)

    // DENIED: super-admin tenant write
    const tenantPut = await apiAs(page, 'PUT', `/api/platform/tenants/${COMPANY_ID}`, { name: 'hack-by-admin' })
    rec.step(`PUT /api/platform/tenants/{id} -> ${tenantPut.status} (expect 401/403)`)

    // DENIED (UI): /platform redirects admin to /dashboard
    const platUi = await gotoApp(page, '/platform')
    rec.addShot(await shot(page, AGENT, 'B2', 'platform-redirect'))
    const platBlocked = redirectedAway(platUi.url, '/platform') || looksDenied(platUi.text)
    rec.step(`/platform UI url=${platUi.url} blocked=${platBlocked}`)

    rec.expect('people=200, modulesPUT=200, settingsUI+nav, platform=403, tenantPUT=403, /platform redirect')
    const pass =
      people.status === 200 &&
      modPut.status === 200 &&
      setUi.url.includes('/dashboard/settings') &&
      navSettings &&
      plat.status === 403 &&
      (tenantPut.status === 403 || tenantPut.status === 401) &&
      platBlocked
    rec.finish(
      pass,
      `people=${people.status}, modulesPUT=${modPut.status}, settingsNav=${ok(navSettings)}, platformAPI=${plat.status}, tenantPUT=${tenantPut.status}, platformUIblocked=${ok(platBlocked)}`
    )
    await page.close()
  })

  // -------------------------------------------------------------------
  // B3 — Staff (hr): oversight yes, system config no
  // -------------------------------------------------------------------
  await run('B3', 'Staff: volunteer oversight allowed; system config denied (UI hidden + API 403)', async () => {
    const { page } = await loginRole(ctx, AGENT, 'staff')
    rec.step('Logged in as staff (role=hr)')

    // ALLOWED: people oversight
    const people = await apiAs(page, 'GET', '/api/people')
    rec.step(`GET /api/people -> ${people.status} (expect 200)`)
    const peopleUi = await gotoApp(page, '/dashboard/people')
    rec.addShot(await shot(page, AGENT, 'B3', 'people-ui'))
    await gotoApp(page, '/dashboard')
    const navPeople = await navHasLabel(page, 'People')
    rec.step(`People nav present for staff = ${navPeople} (expect true), url=${peopleUi.url}`)

    // DENIED (UI): Settings nav hidden for hr (Profile's "Account settings"
    // description must NOT count — navHasLabel matches the exact "Settings" line)
    const navSettings = await navHasLabel(page, 'Settings')
    rec.step(`Settings nav present for staff = ${navSettings} (expect false)`)

    // DENIED (API): module config write requires admin
    const modPut = await apiAs(page, 'PUT', '/api/modules', { moduleId: 'leave', enabled: true })
    rec.step(`PUT /api/modules -> ${modPut.status} (expect 403)`)
    // DENIED (API): settings write requires admin
    const setPost = await apiAs(page, 'POST', '/api/settings', { company_name: 'hack-by-staff' })
    rec.step(`POST /api/settings -> ${setPost.status} (expect 403)`)

    // Direct-navigate the config route: page may render shell, but config
    // is unreachable because the API rejects. Also /platform must redirect.
    const platUi = await gotoApp(page, '/platform')
    rec.addShot(await shot(page, AGENT, 'B3', 'platform-redirect'))
    const platBlocked = redirectedAway(platUi.url, '/platform') || looksDenied(platUi.text)
    rec.step(`/platform url=${platUi.url} blocked=${platBlocked}`)

    rec.expect('people=200, peopleNav shown; settingsNav hidden, modulesPUT=403, settingsPOST=403, /platform redirect')
    const pass =
      people.status === 200 &&
      navPeople &&
      navSettings === false &&
      modPut.status === 403 &&
      setPost.status === 403 &&
      platBlocked
    rec.finish(
      pass,
      `people=${people.status}, peopleNav=${ok(navPeople)}, settingsNavHidden=${ok(navSettings === false)}, modulesPUT=${modPut.status}, settingsPOST=${setPost.status}, platformUIblocked=${ok(platBlocked)}`
    )
    await page.close()
  })

  // -------------------------------------------------------------------
  // B4 — Volunteer (employee): self-service only
  // -------------------------------------------------------------------
  await run('B4', 'Volunteer: own profile + training only; cannot list others or hit admin APIs', async () => {
    const { page } = await loginRole(ctx, AGENT, 'volunteer')
    rec.step('Logged in as volunteer (role=employee)')

    // ALLOWED: view/edit OWN profile
    const profUi = await gotoApp(page, '/dashboard/profile')
    rec.addShot(await shot(page, AGENT, 'B4', 'profile-ui'))
    const profLoaded = profUi.url.includes('/dashboard/profile') && !looksDenied(profUi.text)
    rec.step(`/dashboard/profile url=${profUi.url} loaded=${profLoaded}`)
    const stamp = `B4-${Date.now()}`
    const upd = await apiAs(page, 'POST', '/api/profile/update', { updates: { phone: stamp } })
    rec.step(`POST /api/profile/update -> ${upd.status} (expect 200)`)
    const persisted = upd.status === 200 && upd.body?.employee?.phone === stamp

    // ALLOWED: training
    const trainUi = await gotoApp(page, '/dashboard/training')
    rec.addShot(await shot(page, AGENT, 'B4', 'training-ui'))
    const trainLoaded = trainUi.url.includes('/dashboard/training') && !looksDenied(trainUi.text)
    rec.step(`/dashboard/training url=${trainUi.url} loaded=${trainLoaded}`)

    // DENIED (UI): People nav hidden (must be on /dashboard for nav render)
    await gotoApp(page, '/dashboard')
    const navPeople = await navHasLabel(page, 'People')
    rec.step(`People nav present for volunteer = ${navPeople} (expect false)`)
    // DENIED (API): list others
    const people = await apiAs(page, 'GET', '/api/people')
    rec.step(`GET /api/people -> ${people.status} (expect 403)`)

    // DENIED: direct-navigate another user's admin context + admin API
    const otherEmp = FIXTURES.agents.agentB.staff.employeeId
    const otherEmpApi = await apiAs(page, 'GET', `/api/employee/${otherEmp}`)
    rec.step(`GET /api/employee/{staff} -> ${otherEmpApi.status} (expect denied/!=200)`)
    const settingsApi = await apiAs(page, 'POST', '/api/settings', { company_name: 'hack-by-vol' })
    rec.step(`POST /api/settings -> ${settingsApi.status} (expect 403)`)

    rec.expect('profile loads+persists, training loads; peopleNav hidden, people=403, settingsPOST=403')
    const pass =
      profLoaded &&
      persisted &&
      trainLoaded &&
      navPeople === false &&
      people.status === 403 &&
      settingsApi.status === 403
    rec.finish(
      pass,
      `profileLoad=${ok(profLoaded)}, profilePersist=${persisted}, trainingLoad=${ok(trainLoaded)}, peopleNavHidden=${ok(navPeople === false)}, peopleAPI=${people.status}, otherEmpAPI=${otherEmpApi.status}, settingsPOST=${settingsApi.status}`
    )
    await page.close()
  })

  // -------------------------------------------------------------------
  // B5 — Privilege-escalation negatives
  // -------------------------------------------------------------------
  await run('B5', 'Privilege escalation: volunteer→admin surfaces denied; staff→super-admin write denied', async () => {
    // Volunteer hits admin-only route + admin-only APIs directly
    const { page: vp } = await loginRole(ctx, AGENT, 'volunteer')
    rec.step('Volunteer attempts admin-only surfaces')

    const vPlatUi = await gotoApp(vp, '/platform')
    rec.addShot(await shot(vp, AGENT, 'B5', 'vol-platform-redirect'))
    const vPlatBlocked = redirectedAway(vPlatUi.url, '/platform') || looksDenied(vPlatUi.text)
    rec.step(`volunteer /platform url=${vPlatUi.url} blocked=${vPlatBlocked}`)

    const vPeople = await apiAs(vp, 'GET', '/api/people')
    rec.step(`volunteer GET /api/people -> ${vPeople.status} (expect 403)`)
    const vPlatApi = await apiAs(vp, 'GET', '/api/platform/dashboard')
    rec.step(`volunteer GET /api/platform/dashboard -> ${vPlatApi.status} (expect 403)`)
    const vModPut = await apiAs(vp, 'PUT', '/api/modules', { moduleId: 'leave', enabled: true })
    rec.step(`volunteer PUT /api/modules -> ${vModPut.status} (expect 403)`)
    await vp.close()

    // Staff attempts super-admin-only tenant config write
    const { page: sp } = await loginRole(ctx, AGENT, 'staff')
    rec.step('Staff attempts super-admin-only tenant config write')
    const sTenantPut = await apiAs(sp, 'PUT', `/api/platform/tenants/${COMPANY_ID}`, { plan: 'enterprise' })
    rec.step(`staff PUT /api/platform/tenants/{id} -> ${sTenantPut.status} (expect 403)`)
    const sPlatApi = await apiAs(sp, 'GET', '/api/platform/dashboard')
    rec.step(`staff GET /api/platform/dashboard -> ${sPlatApi.status} (expect 403)`)
    await sp.close()

    rec.expect('vol /platform redirect, vol people/platform/modules=403; staff tenantPUT=403, platform=403')
    const pass =
      vPlatBlocked &&
      vPeople.status === 403 &&
      vPlatApi.status === 403 &&
      vModPut.status === 403 &&
      (sTenantPut.status === 403 || sTenantPut.status === 401) &&
      sPlatApi.status === 403
    rec.finish(
      pass,
      `vol[/platform blocked=${ok(vPlatBlocked)}, people=${vPeople.status}, platform=${vPlatApi.status}, modulesPUT=${vModPut.status}] staff[tenantPUT=${sTenantPut.status}, platform=${sPlatApi.status}]`
    )
  })

  // -------------------------------------------------------------------
  // B6 — Permission matrix sweep
  // -------------------------------------------------------------------
  await run('B6', 'Permission matrix sweep: {role × action} grid driven by real users', async () => {
    // expected[role][action] = true(allowed) / false(denied)
    const tiers = ['super_admin', 'admin', 'staff', 'volunteer']
    const actions = [
      'view_people', // GET /api/people  (200 = allowed)
      'edit_own_profile', // POST /api/profile/update  (200)
      'open_settings_ui', // Settings nav link visible
      'modules_put', // PUT /api/modules  (200)
      'platform_dashboard', // GET /api/platform/dashboard (200)
      'open_platform_ui', // /platform stays on /platform (not redirected)
    ]
    // 4-tier spec
    const expected = {
      super_admin: { view_people: true, edit_own_profile: true, open_settings_ui: true, modules_put: true, platform_dashboard: true, open_platform_ui: true },
      admin: { view_people: true, edit_own_profile: true, open_settings_ui: true, modules_put: true, platform_dashboard: false, open_platform_ui: false },
      staff: { view_people: true, edit_own_profile: true, open_settings_ui: false, modules_put: false, platform_dashboard: false, open_platform_ui: false },
      volunteer: { view_people: false, edit_own_profile: true, open_settings_ui: false, modules_put: false, platform_dashboard: false, open_platform_ui: false },
    }

    const grid = [] // rows: {role, action, expected, got, ok}
    const display = [] // "role|action|expected|got|ok"
    let allMatch = true

    for (const tier of tiers) {
      const { page } = await loginRole(ctx, AGENT, tier)

      // API-driven cells
      const people = await apiAs(page, 'GET', '/api/people')
      const stamp = `B6-${tier}-${Date.now()}`
      const prof = await apiAs(page, 'POST', '/api/profile/update', { updates: { phone: stamp } })
      const mod = await apiAs(page, 'PUT', '/api/modules', { moduleId: 'leave', enabled: true })
      const plat = await apiAs(page, 'GET', '/api/platform/dashboard')

      // UI-driven cells: load dashboard for nav, then probe /platform
      await gotoApp(page, '/dashboard')
      const navSettings = await navHasLabel(page, 'Settings')
      const platUi = await gotoApp(page, '/platform')
      const platUiAllowed = platUi.url.includes('/platform') && !looksDenied(platUi.text)
      await shot(page, AGENT, 'B6', `${tier}-platform`)

      const got = {
        view_people: people.status === 200,
        edit_own_profile: prof.status === 200,
        open_settings_ui: navSettings === true,
        modules_put: mod.status === 200,
        platform_dashboard: plat.status === 200,
        open_platform_ui: platUiAllowed,
      }
      // raw status map for evidence
      const raw = {
        view_people: people.status,
        edit_own_profile: prof.status,
        open_settings_ui: navSettings,
        modules_put: mod.status,
        platform_dashboard: plat.status,
        open_platform_ui: platUi.url,
      }

      for (const a of actions) {
        const cellOk = got[a] === expected[tier][a]
        if (!cellOk) allMatch = false
        grid.push({ role: tier, action: a, expected: expected[tier][a], got: got[a], raw: raw[a], ok: cellOk })
        display.push(`${tier}|${a}|exp=${expected[tier][a]}|got=${got[a]}|raw=${raw[a]}|${cellOk ? 'OK' : 'MISMATCH'}`)
      }
      await page.close()
    }

    rec.step(`matrix cells: ${grid.length}, allMatch=${allMatch}`)
    rec.expect('every {role × action} cell matches the 4-tier RBAC spec')
    rec.finish(allMatch, { allMatch, rows: display, grid })
  })

  rec.save()

  // --------- console summary ----------
  const out = rec.scenarios
  const pass = out.filter((s) => s.pass).length
  const fail = out.filter((s) => s.pass === false).length
  console.log('\n================ AGENT B SUMMARY ================')
  console.log(`${pass} pass / ${fail} fail of ${out.length}`)
  for (const s of out) {
    console.log(`  ${s.pass ? 'PASS' : 'FAIL'}  ${s.id}  ${s.useCase}`)
    if (typeof s.actual === 'string') console.log(`        ${s.actual}`)
  }
  const b6 = out.find((s) => s.id === 'B6')
  if (b6 && b6.actual && b6.actual.rows) {
    console.log('\n  --- B6 MATRIX (role|action|expected|got|raw|status) ---')
    for (const r of b6.actual.rows) console.log('   ' + r)
  }
  console.log('================================================')
} finally {
  await browser.close()
}
