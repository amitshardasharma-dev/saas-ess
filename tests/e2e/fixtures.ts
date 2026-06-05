/**
 * Shared Playwright fixtures + helpers, ported from the .mjs harness.
 *
 * - FIXTURES: parsed tests/fixtures/users.json (5-role set, expense categories,
 *   sample/scale volunteers).
 * - ROLE_USERS: the 5 underlying roles + approver/non-approver managers.
 * - loginByApi(): the proven login-by-API technique — POST /api/auth/login, then
 *   stash tokens in localStorage exactly like the app's auth-proxy, so the SPA
 *   boots authenticated. Used by auth.setup.ts to mint storageState per role.
 * - api(): authenticated fetch via the page's bearer token (status + json body).
 * - expectIsolation404(): tenant-isolation probe helper.
 */

import { test as base, expect, type Page, type APIRequestContext, request } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export { expect }

export const BASE = process.env.E2E_BASE || 'https://saas-ess.vercel.app'

type RoleUser = {
  email: string
  password: string
  role: string
  is_super_admin: boolean
  employeeId: string
  appUserId: string
  isApprover?: boolean
  reportsTo?: string
}

type Fixtures = {
  company_id: string
  password: string
  roles: Record<string, RoleUser>
  expenseCategories: string[]
  sampleVolunteers: { email: string; employeeId: string; doneCount: number }[]
  scaleSeeded?: number
}

export const FIXTURES: Fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/users.json'), 'utf8')
)

export const ROLE_USERS = FIXTURES.roles

/**
 * Log in by calling the real auth API in-page, then persist tokens to
 * localStorage the way services/auth-proxy.ts does. Returns the login result.
 */
export async function loginByApi(page: Page, email: string, password = 'Test1234!') {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const res = await page.evaluate(async ({ email, password }) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ usr: email, pwd: password }),
    })
    const data = await r.json().catch(() => ({}))
    if (r.ok && data.access_token) {
      localStorage.setItem('ess_access_token', data.access_token)
      localStorage.setItem('ess_refresh_token', data.refresh_token || '')
      localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user: { email: data.user, role: data.role, full_name: data.full_name, is_super_admin: data.is_super_admin },
            isAuthenticated: true,
          },
          version: 0,
        })
      )
    }
    return { status: r.status, ok: r.ok, role: data.role, message: data.message }
  }, { email, password })
  return res
}

/** Authenticated API call using the page's stored bearer token. */
export async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; ok: boolean; body: any }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const t = localStorage.getItem('ess_access_token')
      const opts: RequestInit = { method, headers: { Authorization: t ? `Bearer ${t}` : '' } }
      if (body !== undefined) {
        ;(opts.headers as Record<string, string>)['Content-Type'] = 'application/json'
        opts.body = JSON.stringify(body)
      }
      const r = await fetch(path, opts)
      let data: any = null
      try { data = await r.json() } catch {}
      return { status: r.status, ok: r.ok, body: data }
    },
    { method, path, body }
  )
}

// Per-worker token cache: each Playwright worker is its own process, so this
// memoizes one login per (email) for that worker's lifetime. Without it every
// tokenFor() call minted a fresh login — across all specs that burst of auth
// traffic trips Vercel's Attack Challenge Mode (x-vercel-mitigated: challenge),
// which then 403s the whole suite. Cache the promise so concurrent callers share
// one in-flight login instead of racing N of them.
const _tokenCache = new Map<string, Promise<string>>()

/** Raw token for a role (used by API-only / multi-role specs). Memoized per worker. */
export function tokenFor(email: string, password = 'Test1234!'): Promise<string> {
  const cached = _tokenCache.get(email)
  if (cached) return cached
  const p = (async () => {
    const ctx: APIRequestContext = await request.newContext({ baseURL: BASE })
    const r = await ctx.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      form: { usr: email, pwd: password },
    })
    const data = await r.json()
    await ctx.dispose()
    if (!data.access_token) throw new Error(`login failed for ${email}: ${data.message}`)
    return data.access_token as string
  })()
  // If the login fails, evict so a later call can retry rather than caching the rejection.
  p.catch(() => _tokenCache.delete(email))
  _tokenCache.set(email, p)
  return p
}

/** Direct API call with an explicit bearer token (no page needed). */
export async function apiWithToken(
  token: string | null,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  const ctx = await request.newContext({ baseURL: BASE })
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const r = await ctx.fetch(path, { method, headers, data: body !== undefined ? JSON.stringify(body) : undefined })
  let data: any = null
  try { data = await r.json() } catch {}
  const status = r.status()
  await ctx.dispose()
  return { status, body: data }
}

/** Tenant-isolation probe: a foreign/non-existent id must 404 (no existence leak). */
export async function expectIsolation404(token: string, path: string) {
  const { status } = await apiWithToken(token, 'GET', path)
  expect([404, 403], `${path} should deny cross-tenant access`).toContain(status)
}

export const test = base
