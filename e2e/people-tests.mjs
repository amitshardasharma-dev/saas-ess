// E2E tests for: Profile, People/Onboarding, Communications, Reporting, Appraisals, Settings.
// Real production app, real headless browser. Run: node e2e/people-tests.mjs
import { writeFileSync } from 'fs'
import { launch, loginAs, visit, apiGet, BASE } from './helper.mjs'

const results = []
const add = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} :: ${name} :: ${detail}`)
}

// POST helper using bearer token (mirrors apiGet)
async function apiPost(page, path, body, contentType = 'application/json') {
  return page.evaluate(async ({ p, b, ct }) => {
    const t = localStorage.getItem('ess_access_token')
    const headers = { 'Content-Type': ct }
    if (t) headers.Authorization = 'Bearer ' + t
    const r = await fetch(p, {
      method: 'POST',
      headers,
      body: ct === 'application/json' ? JSON.stringify(b) : new URLSearchParams(b),
    })
    let rb = null
    try { rb = await r.json() } catch { try { rb = (await r.text()).slice(0, 300) } catch { rb = null } }
    return { status: r.status, ok: r.ok, body: rb }
  }, { p: path, b: body, ct: contentType })
}

// Grab the main content text (strip the sidebar nav that DashboardLayout renders first).
async function mainText(page) {
  return page.evaluate(() => {
    const el = document.querySelector('main') || document.querySelector('[role="main"]')
    const t = (el ? el.innerText : document.body.innerText) || ''
    // drop the common nav prefix if present
    return t.replace(/^[\s\S]*?Sign out/i, '').slice(0, 600) || t.slice(0, 600)
  }).catch(() => '')
}

const shape = (b) => {
  if (b == null) return 'null'
  if (Array.isArray(b)) return `array[${b.length}]` + (b[0] ? ' keys:' + Object.keys(b[0]).slice(0, 8).join(',') : '')
  if (typeof b === 'object') return 'object keys:' + Object.keys(b).slice(0, 10).join(',')
  return typeof b + ':' + String(b).slice(0, 60)
}

// Heuristic: does a rendered page look like a real page (not an error/blank)?
const looksBroken = (text) => {
  const t = (text || '').toLowerCase()
  if (!text || text.trim().length < 30) return 'empty/near-empty body'
  if (t.includes('application error') || t.includes('something went wrong') || t.includes('500') && t.length < 200) return 'error page'
  if (t.includes('404') && t.includes('not found') && t.length < 300) return '404'
  return null
}

const { browser, ctx } = await launch()
try {
  const { page, loginResult } = await loginAs(ctx, 'admin')
  if (!loginResult.ok) {
    add('Login (admin)', false, `login failed: ${JSON.stringify(loginResult)}`)
    throw new Error('cannot continue without login')
  }
  add('Login (admin)', true, `role=${loginResult.role}`)

  // ───────────────────────── 1. PROFILE ─────────────────────────
  {
    const v = await visit(page, '/dashboard/profile', 'profile')
    const broken = looksBroken(v.bodyText)
    const hasErr = v.errors.length > 0
    const txt = v.bodyText.toLowerCase()
    const hasEditUI = /edit|save|update|change password|upload|photo/i.test(v.bodyText)
    add('Profile page renders', !broken && v.status === 200 && !hasErr,
      `status=${v.status} broken=${broken || 'no'} errors=${v.errors.length}${hasErr ? ' ['+v.errors[0]+']' : ''} | edit-UI=${hasEditUI} | text="${v.bodyText.slice(0, 120).replace(/\n+/g, ' ')}"`)

    // APIs
    // by-user route is /api/employee/by-user/[userId] — fetch own user id from auth/user first
    const me = await apiGet(page, '/api/auth/user')
    const myUserId = me.body?.user?.name || me.body?.user?.email || ''
    const byUser = await apiGet(page, `/api/employee/by-user/${encodeURIComponent(myUserId)}`)
    add('API /api/employee/by-user/[userId]', [200, 404].includes(byUser.status), `userId=${myUserId} status=${byUser.status} shape=${shape(byUser.body)}`)

    const settings = await apiGet(page, '/api/settings')
    add('API /api/settings', settings.status === 200, `status=${settings.status} shape=${shape(settings.body)}`)

    // probe profile sub-APIs
    const profileGet = await apiGet(page, '/api/profile')
    add('API /api/profile (GET)', [200, 404].includes(profileGet.status), `status=${profileGet.status} shape=${shape(profileGet.body)}`)
  }

  // ───────────────────────── 2. PEOPLE + ONBOARDING ─────────────────────────
  {
    const people = await visit(page, '/dashboard/people', 'people')
    const broken = looksBroken(people.bodyText)
    const hasList = /search|filter|name|email|department|employee/i.test(people.bodyText)
    add('People page renders (admin list)', !broken && people.status === 200 && !people.errors.length,
      `status=${people.status} broken=${broken || 'no'} errors=${people.errors.length}${people.errors[0] ? ' ['+people.errors[0]+']' : ''} | list-ui=${hasList} | text="${people.bodyText.slice(0, 120).replace(/\n+/g, ' ')}"`)

    const peopleApi = await apiGet(page, '/api/people')
    add('API /api/people', peopleApi.status === 200, `status=${peopleApi.status} shape=${shape(peopleApi.body)}`)

    const onb = await visit(page, '/dashboard/onboarding', 'onboarding')
    const obroken = looksBroken(onb.bodyText)
    const hasChecklist = /checklist|task|onboard|step|complete|new hire/i.test(onb.bodyText)
    add('Onboarding page renders', !obroken && onb.status === 200 && !onb.errors.length,
      `status=${onb.status} broken=${obroken || 'no'} errors=${onb.errors.length}${onb.errors[0] ? ' ['+onb.errors[0]+']' : ''} | checklist-ui=${hasChecklist} | text="${onb.bodyText.slice(0, 120).replace(/\n+/g, ' ')}"`)

    const onbApi = await apiGet(page, '/api/onboarding')
    add('API /api/onboarding', onbApi.status === 200, `status=${onbApi.status} shape=${shape(onbApi.body)}`)
  }

  // ───────────────────────── 3. COMMUNICATIONS ─────────────────────────
  {
    const comm = await visit(page, '/dashboard/communications', 'communications')
    const broken = looksBroken(comm.bodyText)
    const hasCompose = /compose|memo|message|template|send|announce|target|recipient/i.test(comm.bodyText)
    add('Communications page renders', !broken && comm.status === 200 && !comm.errors.length,
      `status=${comm.status} broken=${broken || 'no'} errors=${comm.errors.length}${comm.errors[0] ? ' ['+comm.errors[0]+']' : ''} | compose-ui=${hasCompose} | text="${comm.bodyText.slice(0, 120).replace(/\n+/g, ' ')}"`)

    const commApi = await apiGet(page, '/api/communications')
    add('API /api/communications', commApi.status === 200, `status=${commApi.status} shape=${shape(commApi.body)}`)

    const annApi = await apiGet(page, '/api/announcements/active')
    add('API /api/announcements/active', annApi.status === 200, `status=${annApi.status} shape=${shape(annApi.body)}`)

    // CREATE attempt: send a memo as DRAFT (schema: subject, body_html, targets[], send_email, draft)
    const created = await apiPost(page, '/api/communications', {
      subject: 'E2E QA Test Memo ' + Date.now(),
      body_html: '<p>Automated QA test memo. Safe to ignore.</p>',
      targets: [{ target_type: 'all' }],
      send_email: false,
      draft: true,
    })
    add('CREATE communication (POST draft memo)', [200, 201].includes(created.status),
      `status=${created.status} body=${shape(created.body)}`)
  }

  // ───────────────────────── 4. REPORTING ─────────────────────────
  {
    const rep = await visit(page, '/dashboard/reports', 'reports')
    const broken = looksBroken(rep.bodyText)
    const hasReportUI = /report|export|csv|filter|training|compliance|download/i.test(rep.bodyText)
    add('Reports page renders', !broken && rep.status === 200 && !rep.errors.length,
      `status=${rep.status} broken=${broken || 'no'} errors=${rep.errors.length}${rep.errors[0] ? ' ['+rep.errors[0]+']' : ''} | report-ui=${hasReportUI} | text="${rep.bodyText.slice(0, 120).replace(/\n+/g, ' ')}"`)

    // probe several report endpoints
    for (const ep of ['/api/reports/training', '/api/reports/compliance', '/api/reports']) {
      const r = await apiGet(page, ep)
      add(`API ${ep}`, [200, 404].includes(r.status), `status=${r.status} shape=${shape(r.body)}`)
    }
  }

  // ───────────────────────── 5. APPRAISALS ─────────────────────────
  {
    const app = await visit(page, '/dashboard/appraisals', 'appraisals')
    const appMain = await mainText(page)
    const hasUI = /appraisal|cycle|review|rating|goal|performance/i.test(appMain)
    add('Appraisals page renders', app.status === 200 && !app.errors.length && hasUI,
      `status=${app.status} errors=${app.errors.length}${app.errors[0] ? ' ['+app.errors[0]+']' : ''} | appraisal-ui=${hasUI} | main="${appMain.slice(0, 140).replace(/\n+/g, ' ')}"`)

    const cyc = await visit(page, '/dashboard/appraisals/cycles', 'appraisal-cycles')
    const cycMain = await mainText(page)
    const hasCycUI = /cycle|template|active|draft|create|period/i.test(cycMain)
    add('Appraisal cycles page renders', cyc.status === 200 && !cyc.errors.length && hasCycUI,
      `status=${cyc.status} errors=${cyc.errors.length}${cyc.errors[0] ? ' ['+cyc.errors[0]+']' : ''} | cycle-ui=${hasCycUI} | main="${cycMain.slice(0, 140).replace(/\n+/g, ' ')}"`)

    for (const ep of ['/api/appraisals', '/api/appraisal-cycles', '/api/appraisal-templates']) {
      const r = await apiGet(page, ep)
      add(`API ${ep}`, r.status === 200, `status=${r.status} shape=${shape(r.body)}`)
    }
  }

  // ───────────────────────── 6. SETTINGS ─────────────────────────
  {
    const set = await visit(page, '/dashboard/settings', 'settings')
    const setMain = await mainText(page)
    const hasToggles = /toggle|enable|disable|module|company|setting|config|save|notification|language|theme/i.test(setMain)
    add('Settings page renders (admin)', set.status === 200 && !set.errors.length && hasToggles,
      `status=${set.status} errors=${set.errors.length}${set.errors[0] ? ' ['+set.errors[0]+']' : ''} | settings-ui=${hasToggles} | main="${setMain.slice(0, 140).replace(/\n+/g, ' ')}"`)

    const modApi = await apiGet(page, '/api/modules')
    add('API /api/modules', modApi.status === 200, `status=${modApi.status} shape=${shape(modApi.body)}`)
  }

} catch (e) {
  add('FATAL', false, e.message)
} finally {
  await browser.close()
}

writeFileSync('/Volumes/ssd2/projects/saas-ess/e2e/results/people.json', JSON.stringify(results, null, 2))
const pass = results.filter(r => r.pass).length
console.log(`\n==== ${pass}/${results.length} PASS ====`)
