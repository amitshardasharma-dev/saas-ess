// Shared E2E harness for the Volunteer Management test suite (agents A/B/C).
// - launch(): browser + context
// - loginByEmail(ctx, email, pwd): authenticated page (tokens in localStorage)
// - loginRole(ctx, agent, tier): login the seeded user for a role tier
// - shot(page, agent, scenario, step): screenshot -> test-results/screenshots/<agent>_<scenario>_<step>.png
// - apiAs(page, method, path, body): call an app API with the page's bearer token
// - Recorder: accumulates scenario results -> results.json

import { chromium } from '/tmp/node_modules/playwright-core/index.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

export const BASE = process.env.E2E_BASE || 'https://saas-ess.vercel.app'
const ROOT = '/Volumes/ssd2/projects/saas-ess'
export const SHOTS_DIR = `${ROOT}/test-results/screenshots`
mkdirSync(SHOTS_DIR, { recursive: true })

export const FIXTURES = JSON.parse(readFileSync(`${ROOT}/tests/fixtures/users.json`, 'utf8'))

export async function launch() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  return { browser, ctx }
}

export async function loginByEmail(ctx, email, pwd = 'Test1234!') {
  const page = await ctx.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 })
  const res = await page.evaluate(async ({ email, pwd }) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ usr: email, pwd }),
    })
    const data = await r.json().catch(() => ({}))
    if (r.ok && data.access_token) {
      localStorage.setItem('ess_access_token', data.access_token)
      localStorage.setItem('ess_refresh_token', data.refresh_token || '')
      localStorage.setItem('auth-storage', JSON.stringify({
        state: { user: { email: data.user, role: data.role, full_name: data.full_name }, isAuthenticated: true },
        version: 0,
      }))
    }
    return { status: r.status, ok: r.ok, role: data.role, message: data.message }
  }, { email, pwd })
  return { page, login: res }
}

export async function loginRole(ctx, agent, tier) {
  const u = FIXTURES.agents[agent][tier]
  if (!u) throw new Error(`no fixture for ${agent}.${tier}`)
  const r = await loginByEmail(ctx, u.email, u.password)
  return { ...r, user: u }
}

// Logout / fresh page with no auth (for unauthorized-access tests)
export async function freshPage(ctx) {
  const page = await ctx.newPage()
  return page
}

let shotSeq = 0
export async function shot(page, agent, scenario, step) {
  const safe = String(step).replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const n = String(++shotSeq).padStart(2, '0')
  const file = `${agent}_${scenario}_${n}-${safe}.png`
  const path = `${SHOTS_DIR}/${file}`
  await page.screenshot({ path, fullPage: true }).catch(() => {})
  return `screenshots/${file}` // relative path for the HTML report
}

export async function apiAs(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const t = localStorage.getItem('ess_access_token')
    const opts = { method, headers: { Authorization: t ? `Bearer ${t}` : '' } }
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }
    const r = await fetch(path, opts)
    let data = null
    try { data = await r.json() } catch {}
    return { status: r.status, ok: r.ok, body: data }
  }, { method, path, body })
}

export async function gotoApp(page, path, waitMs = 1500) {
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)))
  let status = 0
  const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => { errors.push('GOTO: ' + e.message); return null })
  if (resp) status = resp.status()
  await page.waitForTimeout(waitMs)
  const text = (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 4000)
  const url = page.url()
  return { status, errors, text, url }
}

// --- results recorder ---
export class Recorder {
  constructor(agent) {
    this.agent = agent
    this.scenarios = []
  }
  start(id, useCase) {
    const s = { id, useCase, steps: [], expected: '', actual: '', pass: null, screenshots: [], startedAt: Date.now(), durationMs: 0, error: null }
    this.scenarios.push(s)
    this._cur = s
    return s
  }
  step(text) { this._cur.steps.push(text) }
  addShot(rel) { if (rel) this._cur.screenshots.push(rel) }
  expect(e) { this._cur.expected = e }
  actual(a) { this._cur.actual = a }
  finish(pass, actual) {
    if (actual !== undefined) this._cur.actual = actual
    this._cur.pass = !!pass
    this._cur.durationMs = Date.now() - this._cur.startedAt
  }
  fail(err) {
    this._cur.pass = false
    this._cur.error = String(err && err.stack ? err.stack : err).slice(0, 600)
    this._cur.durationMs = Date.now() - this._cur.startedAt
  }
  save() {
    const dir = `${ROOT}/test-results/${this.agent}`
    mkdirSync(dir, { recursive: true })
    const passed = this.scenarios.filter((s) => s.pass).length
    const failed = this.scenarios.filter((s) => s.pass === false).length
    const out = {
      agent: this.agent,
      generatedAt: new Date().toISOString(),
      total: this.scenarios.length, passed, failed,
      durationMs: this.scenarios.reduce((a, s) => a + s.durationMs, 0),
      scenarios: this.scenarios,
    }
    writeFileSync(`${dir}/results.json`, JSON.stringify(out, null, 2))
    return out
  }
}
