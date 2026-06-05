// Shared E2E helper for Birch/ESS production testing.
// Every test agent imports loginAs() + makeContext() so login is proven once.
//
// Run any test file with:  node e2e/<file>.mjs
// Requires: PW_CHROMIUM path resolved via the @playwright/test install in /tmp.

import { chromium } from '/tmp/node_modules/playwright-core/index.mjs'

export const BASE = process.env.E2E_BASE || 'https://saas-ess.vercel.app'

// Seeded users (password Test1234! for all that were reset).
export const USERS = {
  admin:    { email: 'admin@acme.com',     pwd: 'Test1234!', role: 'admin (super_admin)' },
  hr:       { email: 'hr@acme.com',         pwd: 'Test1234!', role: 'hr' },
  manager:  { email: 'manager@acme.com',    pwd: 'Test1234!', role: 'manager' },
  employee: { email: 'employee1@acme.com',  pwd: 'Test1234!', role: 'employee' },
}

export async function launch() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  return { browser, ctx }
}

// Programmatic login: hit the real /api/auth/login, stash tokens in localStorage
// exactly like the app's auth-proxy does, then the app treats us as logged in.
export async function loginAs(ctx, who = 'admin') {
  const u = USERS[who]
  if (!u) throw new Error('unknown user ' + who)
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))

  // 1. call the login API in-page (same origin) to get tokens
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
  const res = await page.evaluate(async ({ email, pwd }) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ usr: email, pwd }),
    })
    const data = await r.json()
    if (r.ok && data.access_token) {
      localStorage.setItem('ess_access_token', data.access_token)
      localStorage.setItem('ess_refresh_token', data.refresh_token || '')
      // mirror zustand persisted auth so the app boots authenticated
      localStorage.setItem('auth-storage', JSON.stringify({
        state: { user: { email: data.user, role: data.role, full_name: data.full_name }, isAuthenticated: true },
        version: 0,
      }))
    }
    return { status: r.status, ok: r.ok, message: data.message, role: data.role }
  }, { email: u.email, pwd: u.pwd })

  return { page, loginResult: res, errors }
}

// Fetch a tenant API as the logged-in user (uses the bearer token in localStorage).
export async function apiGet(page, path) {
  return page.evaluate(async (p) => {
    const t = localStorage.getItem('ess_access_token')
    const r = await fetch(p, { headers: t ? { Authorization: 'Bearer ' + t } : {} })
    let body = null
    try { body = await r.json() } catch { body = null }
    return { status: r.status, ok: r.ok, body }
  }, path)
}

// Visit a dashboard route, wait for network idle, capture errors + visible text + screenshot.
export async function visit(page, path, shotName) {
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 300)))
  let status = 0
  const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => { errors.push('GOTO: ' + e.message); return null })
  if (resp) status = resp.status()
  await page.waitForTimeout(1500)
  const bodyText = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 2000)
  if (shotName) {
    await page.screenshot({ path: `/Volumes/ssd2/projects/saas-ess/e2e/shots/${shotName}.png`, fullPage: true }).catch(() => {})
  }
  return { path, status, errors, bodyText }
}
