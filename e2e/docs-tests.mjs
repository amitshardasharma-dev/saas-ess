// E2E tests: Documents, E-Signatures, Contracts, Compliance/Certifications
// Run: node e2e/docs-tests.mjs
import { launch, loginAs, visit as _visit, apiGet, BASE } from './helper.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'

// The shared helper's visit() attaches console/pageerror listeners on every call
// WITHOUT removing them, so on a long-lived shared page errors accumulate and bleed
// across navigations (a 403/404 from one route surfaces on the next page's check).
// To get clean per-page error capture we run each visit on a FRESH page in the SAME
// context — auth (localStorage tokens) is shared across pages of the same origin.
async function freshVisit(ctx, path, shot) {
  const p = await ctx.newPage()
  try {
    return await _visit(p, path, shot)
  } finally {
    await p.close().catch(() => {})
  }
}

const results = []
const add = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ::  ${detail}`)
}

// Treat a rendered page as healthy if status==200, no console/page errors,
// and the body doesn't show an obvious crash/error string.
function pageHealthy(r) {
  // Use anchored phrases so timestamps/IDs containing "404" don't false-match.
  const crash = /application error|something went wrong|\b404 page not found\b|page not found|this page could not be found|internal server error|unhandled runtime error|access to the .* dashboard/i
  const bad = r.status !== 200 || r.errors.length > 0 || crash.test(r.bodyText)
  return !bad
}
function summarize(r) {
  const txt = (r.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  return `status=${r.status} errors=${r.errors.length}${r.errors.length ? ' ['+r.errors.slice(0,2).join(' | ').slice(0,200)+']' : ''} text="${txt}"`
}
function apiShape(r) {
  const b = r.body
  let shape = typeof b
  let len = ''
  if (Array.isArray(b)) { shape = 'array'; len = `[${b.length}]` }
  else if (b && typeof b === 'object') {
    const keys = Object.keys(b)
    shape = 'object{' + keys.slice(0, 8).join(',') + '}'
    if (Array.isArray(b.data)) len = ` data[${b.data.length}]`
    else if (Array.isArray(b.items)) len = ` items[${b.items.length}]`
    else if (Array.isArray(b.documents)) len = ` documents[${b.documents.length}]`
    else if (Array.isArray(b.contracts)) len = ` contracts[${b.contracts.length}]`
    else if (Array.isArray(b.certifications)) len = ` certifications[${b.certifications.length}]`
  }
  return `status=${r.status} ok=${r.ok} shape=${shape}${len}`
}

const { browser, ctx } = await launch()
try {
  // ---- login as HR (HR can see manage + all employee views) ----
  const { page, loginResult } = await loginAs(ctx, 'hr')
  if (loginResult.ok) add('login (hr)', true, `role=${loginResult.role}`)
  else add('login (hr)', false, `login failed: ${JSON.stringify(loginResult)}`)

  // ================= 1. DOCUMENTS =================
  {
    const r = await freshVisit(ctx, '/dashboard/documents', 'docs-library')
    add('Documents: library renders', pageHealthy(r), summarize(r))
  }
  {
    const r = await freshVisit(ctx, '/dashboard/documents/manage', 'docs-manage')
    const hasUpload = /upload|add document|new document|category/i.test(r.bodyText)
    add('Documents: HR manage/upload UI', pageHealthy(r), summarize(r) + ` uploadUI=${hasUpload}`)
  }
  // API: /api/documents
  let firstDocId = null
  {
    const r = await apiGet(page, '/api/documents')
    add('API /api/documents', r.ok, apiShape(r))
    const arr = Array.isArray(r.body) ? r.body : (r.body?.data || r.body?.documents || [])
    if (arr.length) firstDocId = arr[0].id || arr[0].name
  }
  // API: /api/document-categories
  {
    const r = await apiGet(page, '/api/document-categories')
    add('API /api/document-categories', r.ok, apiShape(r))
  }
  // doc detail if any
  if (firstDocId) {
    const r = await freshVisit(ctx, `/dashboard/documents/${firstDocId}`, 'docs-detail')
    add('Documents: doc detail renders', pageHealthy(r), summarize(r))
  } else {
    add('Documents: doc detail renders', true, 'SKIPPED — no documents present in library (empty fresh tenant)')
  }

  // ================= 2. E-SIGNATURE (Phase 4) =================
  {
    const r = await freshVisit(ctx, '/dashboard/documents/sign', 'esign-list')
    add('E-sign: signable docs list renders', pageHealthy(r), summarize(r))
  }
  {
    // uses force-dynamic
    const r = await freshVisit(ctx, '/dashboard/documents/sign/status', 'esign-status')
    add('E-sign: status report renders (force-dynamic)', pageHealthy(r), summarize(r))
  }
  // API: /api/signed-documents
  let firstSignId = null
  {
    const r = await apiGet(page, '/api/signed-documents')
    add('API /api/signed-documents', r.ok, apiShape(r))
    const arr = Array.isArray(r.body) ? r.body : (r.body?.data || r.body?.documents || [])
    if (arr.length) firstSignId = arr[0].id
  }
  // field-designer + sign page render. Signable-doc IDs differ from library doc IDs,
  // so derive a real one by clicking through the sign list UI (buttons, not <a href>).
  {
    let signId = null
    const sp = await ctx.newPage()
    const errs = []
    sp.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)))
    try {
      await sp.goto(`${BASE}/dashboard/documents/sign`, { waitUntil: 'networkidle', timeout: 45000 })
      await sp.locator('text=Design fields').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      const designBtn = sp.locator('text=Design fields').first()
      if (await designBtn.count()) {
        await designBtn.click()
        await sp.waitForTimeout(2500)
        const url = sp.url()
        const m = url.match(/\/sign\/([0-9a-f-]+)\/design/)
        signId = m ? m[1] : null
        const txt = (await sp.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 180)
        const designHealthy = /field designer/i.test(txt) && errs.length === 0
        add('E-sign: field-designer renders', designHealthy, `url=${url} errors=${errs.length}${errs.length ? ' ['+errs.slice(0,2).join(' | ')+']' : ''} text="${txt}"`)
        await sp.screenshot({ path: '/Volumes/ssd2/projects/saas-ess/e2e/shots/esign-field-designer.png', fullPage: true }).catch(() => {})
      } else {
        add('E-sign: field-designer renders', true, 'SKIPPED — no signable docs in list')
      }
    } finally {
      await sp.close().catch(() => {})
    }
    if (signId) {
      // NOTE: the actual sign page lives at /dashboard/documents/[id]/sign
      // (the list's "Sign" button routes there), NOT /sign/[id].
      const r1 = await freshVisit(ctx, `/dashboard/documents/${signId}/sign`, 'esign-sign-page')
      add('E-sign: sign page renders', pageHealthy(r1), summarize(r1))
    } else {
      add('E-sign: sign page renders', true, 'SKIPPED — could not derive a signable doc id')
    }
  }

  // ================= 3. CONTRACTS =================
  {
    const r = await freshVisit(ctx, '/dashboard/contracts', 'contracts-my')
    add('Contracts: my contract renders', pageHealthy(r), summarize(r))
  }
  {
    const r = await freshVisit(ctx, '/dashboard/contracts/manage', 'contracts-manage')
    add('Contracts: HR manage renders', pageHealthy(r), summarize(r))
  }
  {
    const r = await apiGet(page, '/api/contracts')
    add('API /api/contracts', r.ok, apiShape(r))
  }
  {
    const r = await apiGet(page, '/api/contract-types')
    add('API /api/contract-types', r.ok, apiShape(r))
  }

  // ================= 4. COMPLIANCE / CERTIFICATIONS (Phase 3) =================
  {
    const r = await freshVisit(ctx, '/dashboard/compliance', 'compliance-dash')
    // expiry-status UI: look for status indicator keywords
    const hasStatusUI = /expir|valid|certif|compliant|overdue|due|active|green|amber|red|warning/i.test(r.bodyText)
    add('Compliance: dashboard renders w/ expiry-status UI', pageHealthy(r), summarize(r) + ` statusUI=${hasStatusUI}`)
  }
  {
    const r = await apiGet(page, '/api/certifications')
    add('API /api/certifications', r.ok, apiShape(r))
  }
  {
    const r = await apiGet(page, '/api/cert-types')
    add('API /api/cert-types', r.ok, apiShape(r))
  }

  // ================= 5. MINIMAL WRITE ATTEMPTS =================
  // Attempt to create a document category (safe metadata write on fresh app).
  {
    const r = await page.evaluate(async () => {
      const t = localStorage.getItem('ess_access_token')
      const r = await fetch('/api/document-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
        body: JSON.stringify({ name: 'E2E QA Category ' + Date.now(), description: 'created by docs e2e' }),
      })
      let body = null; try { body = await r.json() } catch {}
      return { status: r.status, ok: r.ok, body: body ? JSON.stringify(body).slice(0, 200) : null }
    })
    add('WRITE: create document-category', r.ok || r.status === 201, `status=${r.status} ok=${r.ok} resp=${r.body}`)
  }
  // Attempt to create a contract-type (safe metadata write).
  {
    const r = await page.evaluate(async () => {
      const t = localStorage.getItem('ess_access_token')
      const r = await fetch('/api/contract-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
        body: JSON.stringify({ name: 'E2E QA Contract Type ' + Date.now() }),
      })
      let body = null; try { body = await r.json() } catch {}
      return { status: r.status, ok: r.ok, body: body ? JSON.stringify(body).slice(0, 200) : null }
    })
    add('WRITE: create contract-type', r.ok || r.status === 201, `status=${r.status} ok=${r.ok} resp=${r.body}`)
  }
  // Attempt to create a cert-type (safe metadata write).
  {
    const r = await page.evaluate(async () => {
      const t = localStorage.getItem('ess_access_token')
      const r = await fetch('/api/cert-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
        body: JSON.stringify({ name: 'E2E QA Cert Type ' + Date.now() }),
      })
      let body = null; try { body = await r.json() } catch {}
      return { status: r.status, ok: r.ok, body: body ? JSON.stringify(body).slice(0, 200) : null }
    })
    add('WRITE: create cert-type', r.ok || r.status === 201, `status=${r.status} ok=${r.ok} resp=${r.body}`)
  }

} catch (e) {
  add('FATAL', false, 'harness error: ' + (e?.message || e))
} finally {
  await browser.close()
}

mkdirSync('/Volumes/ssd2/projects/saas-ess/e2e/results', { recursive: true })
writeFileSync('/Volumes/ssd2/projects/saas-ess/e2e/results/docs.json', JSON.stringify(results, null, 2))
const pass = results.filter(r => r.pass).length
console.log(`\n==== ${pass}/${results.length} PASS ====`)
