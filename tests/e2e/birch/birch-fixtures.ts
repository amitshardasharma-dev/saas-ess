import { test as base, expect, request, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export { expect }

// Service-role client (test cleanup only). Reads .env.local like the seed script.
const _env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
const _ge = (k: string) => { const m = _env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : '' }
export const sbAdmin = createClient(_ge('NEXT_PUBLIC_SUPABASE_URL'), _ge('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

/** Fully remove a test-created user (onboarding, employee, app_user, auth user). */
export async function cleanupUser(email: string): Promise<void> {
  const { data } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = data?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase())
  if (!u) return
  const { data: au } = await sbAdmin.from('ess_app_users').select('id').eq('auth_user_id', u.id).maybeSingle()
  if (au) {
    const { data: emp } = await sbAdmin.from('ess_employees').select('id').eq('app_user_id', au.id).maybeSingle()
    if (emp) {
      await sbAdmin.from('ess_onboarding_steps').delete().eq('employee_id', emp.id)
      await sbAdmin.from('ess_onboarding_states').delete().eq('employee_id', emp.id)
      await sbAdmin.from('ess_employees').delete().eq('id', emp.id)
    }
    await sbAdmin.from('ess_app_users').delete().eq('id', au.id)
  }
  await sbAdmin.auth.admin.deleteUser(u.id)
}

// HARD SAFETY GUARD (loop constraint #1): birch E2E must target localhost/preview,
// NEVER the live prod URL. Throws at import time otherwise — fail closed.
export const BASE = process.env.E2E_BASE || ''
if (!BASE || /saas-ess\.vercel\.app/.test(BASE)) {
  throw new Error(`UNSAFE_TARGET: birch E2E must run against localhost/preview (got "${BASE}"). Set E2E_BASE=http://localhost:3001`)
}

export const FX = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/birch-e2e.json'), 'utf8')) as {
  companyId: string
  password: string
  users: Record<string, { email: string; role: string; isSuperAdmin: boolean; appUserId: string; employeeId: string; department: string }>
  onboarding: {
    docs: {
      volunteerAgreement: { id: string; versionId: string }
      codeOfConduct: { id: string; versionId: string }
      safeguardingPolicy: { id: string; versionId: string }
    }
    certTypes: { policeCheck: string; blueCard: string }
    modules: {
      induction: { id: string; items: { video: string; document: string; quiz: string } }
      safeguarding: { id: string; items: { video: string } }
    }
  }
}

// A real birch-foundation (OTHER tenant) employee id, for cross-tenant isolation probes.
export const FOREIGN_EMPLOYEE_ID = '48457239-a14d-4da9-aed6-4f8259bee7f9' // Sarah Mitchell @ birch-foundation

// Per-worker token cache: one login per role per worker, so parallel specs don't
// burst the Supabase auth endpoint (which rate-limits). Shares one in-flight login.
const _tokenCache = new Map<string, Promise<string>>()
export function tokenFor(email: string): Promise<string> {
  const cached = _tokenCache.get(email)
  if (cached) return cached
  const p = (async () => {
    const ctx: APIRequestContext = await request.newContext({ baseURL: BASE })
    const r = await ctx.post('/api/auth/login', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, form: { usr: email, pwd: FX.password } })
    const d = await r.json()
    await ctx.dispose()
    if (!d.access_token) throw new Error(`login ${email}: ${d.message || r.status()}`)
    return d.access_token as string
  })()
  p.catch(() => _tokenCache.delete(email))
  _tokenCache.set(email, p)
  return p
}

export async function api(token: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const ctx = await request.newContext({ baseURL: BASE })
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const r = await ctx.fetch(path, { method, headers, data: body !== undefined ? JSON.stringify(body) : undefined })
  let data: Record<string, unknown> | null = null
  try { data = (await r.json()) as Record<string, unknown> } catch {}
  const status = r.status()
  await ctx.dispose()
  return { status, body: data }
}

export const gatePassed = (s: number) => s !== 401 && s !== 403
export const test = base
