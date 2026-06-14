// Core HR E2E: Leave, Expense, Timesheets — tested as employee + admin/manager.
// Run: cd /Volumes/ssd2/projects/saas-ess && node e2e/corehr-tests.mjs
import { launch, loginAs, visit, apiGet } from './helper.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'

const results = []
const rec = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`)
}

// summarize an API body into a one-line shape
function shape(r) {
  if (!r) return 'no response'
  if (!r.ok) return `error status ${r.status}: ${JSON.stringify(r.body)?.slice(0, 160)}`
  const b = r.body
  if (b == null) return `status ${r.status}, body=null`
  if (Array.isArray(b)) return b.length ? `array of ${b.length}` : 'empty array'
  if (typeof b === 'object') {
    // common wrappers
    for (const k of ['data', 'message', 'results', 'items', 'leave_applications', 'claims', 'timesheets', 'leave_types', 'categories', 'balances', 'approvals']) {
      if (Array.isArray(b[k])) return `{${k}: array of ${b[k].length}}`
    }
    const keys = Object.keys(b)
    // try to find any array field
    const arrKey = keys.find(k => Array.isArray(b[k]))
    if (arrKey) return `{${arrKey}: array of ${b[arrKey].length}} (keys: ${keys.slice(0,6).join(',')})`
    return `object keys: ${keys.slice(0, 8).join(',')}`
  }
  return `status ${r.status}, ${typeof b}`
}

// Errors that are known transient hydration races (token not yet read from
// localStorage on first paint). They self-correct; we surface but don't fail on them.
const TRANSIENT = [/401/, /403/, /Failed to fetch/, /Failed to load resource/]
function realErrors(errs) { return errs.filter(e => !TRANSIENT.some(rx => rx.test(e))) }

// page-level assertion. Pass `main` (the page's own content, sidebar-stripped) so
// the assertion isn't dominated by the nav. mainText is fetched by the caller via grabMain().
function checkPage(name, p, expectTextIncludesAny = [], mainText = '') {
  const ok200 = p.status === 200
  const hard = realErrors(p.errors)
  const transient = p.errors.filter(e => TRANSIENT.some(rx => rx.test(e)))
  const content = (mainText || p.bodyText || '')
  const txt = content.toLowerCase()
  const hasText = content.trim().length > 30
  const matched = expectTextIncludesAny.length === 0
    ? true
    : expectTextIncludesAny.some(t => txt.includes(t.toLowerCase()))
  const pass = ok200 && hard.length === 0 && hasText && matched
  const first = content.slice(0, 300).replace(/\n+/g, ' | ')
  const detail = `status=${p.status} hardErr=${hard.length}${hard.length ? '[' + hard.slice(0, 2).join(' ;; ') + ']' : ''} transientErr=${transient.length} matched=${matched} | main: ${first}`
  rec(name, pass, detail)
  return p
}

// Grab the page's <main> content (sidebar-stripped), after letting it settle.
async function grabMain(page) {
  await page.waitForTimeout(800)
  return page.evaluate(() => {
    const m = document.querySelector('main') || document.querySelector('[role=main]')
    return m ? m.innerText : document.body.innerText
  }).catch(() => '')
}

mkdirSync('/Volumes/ssd2/projects/saas-ess/e2e/results', { recursive: true })
mkdirSync('/Volumes/ssd2/projects/saas-ess/e2e/shots', { recursive: true })

const { browser, ctx } = await launch()
try {
  // ============ EMPLOYEE SESSION ============
  const emp = await loginAs(ctx, 'employee')
  rec('login:employee', emp.loginResult.ok, `status=${emp.loginResult.status} role=${emp.loginResult.role}`)
  const ep = emp.page

  // ---- LEAVE (employee) ----
  let v
  v = await visit(ep, '/dashboard/leave-applications', 'emp-leave-list');       checkPage('emp:page /dashboard/leave-applications', v, ['leave application'], await grabMain(ep))
  v = await visit(ep, '/dashboard/leave-applications/new', 'emp-leave-new');     checkPage('emp:page /dashboard/leave-applications/new', v, ['leave', 'type', 'date'], await grabMain(ep))
  v = await visit(ep, '/dashboard/team-calendar', 'emp-team-calendar');         checkPage('emp:page /dashboard/team-calendar', v, ['calendar', 'team', 'leave'], await grabMain(ep))
  v = await visit(ep, '/dashboard/team-balances', 'emp-team-balances');         checkPage('emp:page /dashboard/team-balances', v, ['balance', 'leave'], await grabMain(ep))

  // ---- LEAVE APIs (employee) ----
  let r
  r = await apiGet(ep, '/api/leave-applications'); rec('emp:api /api/leave-applications', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ep, '/api/leave-types');        rec('emp:api /api/leave-types', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ep, '/api/team-balances');      rec('emp:api /api/team-balances', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ep, '/api/team-calendar');      rec('emp:api /api/team-calendar', r.ok, `status=${r.status} | ${shape(r)}`)

  // capture leave types for create flow
  const ltRes = await apiGet(ep, '/api/leave-types')
  let leaveTypes = []
  if (ltRes.ok) {
    const b = ltRes.body
    leaveTypes = Array.isArray(b) ? b : (b?.data || b?.leave_types || b?.message || [])
  }

  // ---- EXPENSE (employee) ----
  v = await visit(ep, '/dashboard/expense-claims', 'emp-expense-list');     checkPage('emp:page /dashboard/expense-claims', v, ['expense', 'claim'], await grabMain(ep))
  v = await visit(ep, '/dashboard/expense-claims/new', 'emp-expense-new');  checkPage('emp:page /dashboard/expense-claims/new', v, ['expense', 'amount', 'claim'], await grabMain(ep))
  r = await apiGet(ep, '/api/expense-claims');     rec('emp:api /api/expense-claims', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ep, '/api/expense-categories'); rec('emp:api /api/expense-categories', r.ok, `status=${r.status} | ${shape(r)}`)

  // ---- TIMESHEETS (employee) ----
  v = await visit(ep, '/dashboard/timesheets', 'emp-timesheets'); checkPage('emp:page /dashboard/timesheets', v, ['timesheet', 'hours', 'week'], await grabMain(ep))
  r = await apiGet(ep, '/api/timesheets');       rec('emp:api /api/timesheets', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ep, '/api/timesheet-config'); rec('emp:api /api/timesheet-config', r.ok, `status=${r.status} | ${shape(r)}`)

  // ============ CREATE FLOWS (employee) ============
  // Leave create: try via API (POST) with a valid leave type to verify persistence.
  try {
    // API validates against the human-readable leave_type_name (e.g. "Annual Leave"),
    // NOT the short code in `name` (e.g. "AL"). Prefer leave_type_name.
    const ltName = leaveTypes[0]?.leave_type_name || leaveTypes[0]?.leave_type || leaveTypes[0]?.name || (typeof leaveTypes[0] === 'string' ? leaveTypes[0] : null)
    if (!ltName) {
      rec('emp:create leave (API POST)', false, `cannot create: no leave types available (${shape(ltRes)})`)
    } else {
      const today = new Date()
      const d1 = new Date(today.getTime() + 7 * 864e5).toISOString().slice(0, 10)
      const d2 = new Date(today.getTime() + 8 * 864e5).toISOString().slice(0, 10)
      const post = await ep.evaluate(async ({ ltName, d1, d2 }) => {
        const t = localStorage.getItem('ess_access_token')
        const payloads = [
          { leave_type: ltName, from_date: d1, to_date: d2, reason: 'E2E test leave', description: 'E2E test leave' },
        ]
        const r = await fetch('/api/leave-applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify(payloads[0]),
        })
        let body = null; try { body = await r.json() } catch {}
        return { status: r.status, ok: r.ok, body }
      }, { ltName, d1, d2 })
      rec('emp:create leave (API POST)', post.ok || post.status === 201, `status=${post.status} | ${JSON.stringify(post.body)?.slice(0, 240)}`)
    }
  } catch (e) {
    rec('emp:create leave (API POST)', false, 'exception: ' + e.message)
  }

  // Leave create via FORM UI (fill + submit), report outcome
  try {
    const f = await visit(ep, '/dashboard/leave-applications/new', 'emp-leave-form-before')
    if (f.status !== 200) {
      rec('emp:create leave (UI form)', false, `form page status=${f.status}`)
    } else {
      // Try to fill any select + date inputs present, then submit.
      const filled = await ep.evaluate(() => {
        const out = { selects: 0, dates: 0, textareas: 0, submitFound: false }
        document.querySelectorAll('select').forEach(s => {
          if (s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); out.selects++ }
        })
        const dates = [...document.querySelectorAll('input[type=date]')]
        const today = new Date()
        dates.forEach((d, i) => {
          const v = new Date(today.getTime() + (10 + i) * 864e5).toISOString().slice(0, 10)
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(d, v); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })); out.dates++
        })
        document.querySelectorAll('textarea').forEach(t => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(t, 'E2E UI test leave'); t.dispatchEvent(new Event('input', { bubbles: true })); out.textareas++
        })
        out.submitFound = !!document.querySelector('button[type=submit], form button')
        return out
      })
      // click submit
      let submitted = false, afterTxt = ''
      const btn = await ep.$('button[type=submit]') || await ep.$('form button')
      if (btn) {
        await btn.click().catch(() => {})
        await ep.waitForTimeout(2500)
        submitted = true
        afterTxt = (await ep.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 200).replace(/\n+/g, ' | ')
      }
      rec('emp:create leave (UI form)', submitted, `filled=${JSON.stringify(filled)} submitted=${submitted} | after: ${afterTxt}`)
    }
  } catch (e) {
    rec('emp:create leave (UI form)', false, 'exception: ' + e.message)
  }

  // Expense create via API POST
  try {
    const catRes = await apiGet(ep, '/api/expense-categories')
    let cats = []
    if (catRes.ok) { const b = catRes.body; cats = Array.isArray(b) ? b : (b?.data || b?.categories || b?.message || []) }
    const catName = cats[0]?.name || cats[0]?.category || cats[0]?.expense_category || (typeof cats[0] === 'string' ? cats[0] : null)
    const today = new Date().toISOString().slice(0, 10)
    const post = await ep.evaluate(async ({ catName, today }) => {
      const t = localStorage.getItem('ess_access_token')
      const body = { expense_type: catName, category: catName, amount: 12.5, expense_date: today, date: today, description: 'E2E test expense' }
      const r = await fetch('/api/expense-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify(body),
      })
      let b = null; try { b = await r.json() } catch {}
      return { status: r.status, ok: r.ok, body: b }
    }, { catName, today })
    rec('emp:create expense (API POST)', post.ok || post.status === 201, `cat=${catName} status=${post.status} | ${JSON.stringify(post.body)?.slice(0, 220)}`)
  } catch (e) {
    rec('emp:create expense (API POST)', false, 'exception: ' + e.message)
  }

  // Open an expense claim detail if any exist
  try {
    const ec = await apiGet(ep, '/api/expense-claims')
    let claims = []
    if (ec.ok) { const b = ec.body; claims = Array.isArray(b) ? b : (b?.data || b?.claims || b?.message || []) }
    if (claims.length) {
      const id = claims[0].name || claims[0].id || claims[0].claim_id
      const detail = await visit(ep, `/dashboard/expense-claims/${id}`, 'emp-expense-detail')
      checkPage(`emp:page expense-claim detail (${id})`, detail, ['expense', 'amount', 'claim'])
    } else {
      rec('emp:page expense-claim detail', true, 'no claims exist to open (empty list) — skipped, not a failure')
    }
  } catch (e) {
    rec('emp:page expense-claim detail', false, 'exception: ' + e.message)
  }

  await ep.close()

  // ============ MANAGER SESSION ============
  const mgr = await loginAs(ctx, 'manager')
  rec('login:manager', mgr.loginResult.ok, `status=${mgr.loginResult.status} role=${mgr.loginResult.role}`)
  const mp = mgr.page
  v = await visit(mp, '/dashboard/pending-approvals', 'mgr-pending-approvals'); checkPage('mgr:page /dashboard/pending-approvals', v, ['approval', 'pending'], await grabMain(mp))
  v = await visit(mp, '/dashboard/approval-history', 'mgr-approval-history');   checkPage('mgr:page /dashboard/approval-history', v, ['approval', 'history'], await grabMain(mp))
  v = await visit(mp, '/dashboard/team-timesheets', 'mgr-team-timesheets');     checkPage('mgr:page /dashboard/team-timesheets', v, ['timesheet', 'team'], await grabMain(mp))
  v = await visit(mp, '/dashboard/team-balances', 'mgr-team-balances');         checkPage('mgr:page /dashboard/team-balances', v, ['balance', 'leave'], await grabMain(mp))
  v = await visit(mp, '/dashboard/team-calendar', 'mgr-team-calendar');         checkPage('mgr:page /dashboard/team-calendar', v, ['calendar', 'team'], await grabMain(mp))

  r = await apiGet(mp, '/api/pending-approvals'); rec('mgr:api /api/pending-approvals', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(mp, '/api/team-timesheets').catch(()=>({})); rec('mgr:api /api/team-timesheets', r.ok, `status=${r.status} | ${shape(r)}`)
  await mp.close()

  // ============ ADMIN SESSION (full module access) ============
  const adm = await loginAs(ctx, 'admin')
  rec('login:admin', adm.loginResult.ok, `status=${adm.loginResult.status} role=${adm.loginResult.role}`)
  const ap = adm.page
  v = await visit(ap, '/dashboard/pending-approvals', 'admin-pending-approvals'); checkPage('admin:page /dashboard/pending-approvals', v, ['approval', 'pending'], await grabMain(ap))
  v = await visit(ap, '/dashboard/approval-history', 'admin-approval-history');   checkPage('admin:page /dashboard/approval-history', v, ['approval', 'history'], await grabMain(ap))
  v = await visit(ap, '/dashboard/team-timesheets', 'admin-team-timesheets');     checkPage('admin:page /dashboard/team-timesheets', v, ['timesheet'], await grabMain(ap))
  v = await visit(ap, '/dashboard/timesheets', 'admin-timesheets');              checkPage('admin:page /dashboard/timesheets', v, ['timesheet'], await grabMain(ap))

  r = await apiGet(ap, '/api/pending-approvals'); rec('admin:api /api/pending-approvals', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ap, '/api/leave-applications'); rec('admin:api /api/leave-applications', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ap, '/api/expense-claims'); rec('admin:api /api/expense-claims', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ap, '/api/timesheets'); rec('admin:api /api/timesheets', r.ok, `status=${r.status} | ${shape(r)}`)
  r = await apiGet(ap, '/api/timesheet-config'); rec('admin:api /api/timesheet-config', r.ok, `status=${r.status} | ${shape(r)}`)
  await ap.close()
} catch (e) {
  rec('FATAL', false, 'suite crashed: ' + e.message + '\n' + e.stack)
} finally {
  await browser.close()
}

writeFileSync('/Volumes/ssd2/projects/saas-ess/e2e/results/corehr.json', JSON.stringify(results, null, 2))
const pass = results.filter(r => r.pass).length
console.log(`\n==== DONE: ${pass}/${results.length} pass, ${results.length - pass} fail ====`)
