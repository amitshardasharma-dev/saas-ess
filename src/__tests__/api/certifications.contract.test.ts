/**
 * @jest-environment node
 *
 * Contract tests for /api/certifications — scope rules, status cache on write,
 * expiry auto-derivation, history creation, and the onboarding hook. Uses a
 * small stateful supabaseAdmin mock plus a controllable withAuth.
 */
import { NextRequest } from 'next/server'

// UUID-shaped ids so the strict Zod schema (.uuid()) accepts them.
const CT1 = '11111111-1111-1111-1111-111111111111'
const E1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const E2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const E3 = 'aaaaaaaa-0000-0000-0000-000000000003'
const MGR1 = 'bbbbbbbb-0000-0000-0000-000000000001'
const UNKNOWN = '99999999-9999-9999-9999-999999999999'

interface MockState {
  cert_types: any[]
  certifications: any[]
  history: any[]
  employees: any[]
}
// eslint-disable-next-line no-var
var state: MockState = { cert_types: [], certifications: [], history: [], employees: [] }
// eslint-disable-next-line no-var
var mockAuthCtx: Record<string, unknown> = {}

jest.mock('@/lib/auth-middleware', () => ({
  withAuth:
    (handler: (req: unknown, ctx: unknown, params?: unknown) => unknown) =>
    (req: unknown, routeCtx?: { params?: Promise<unknown> }) =>
      Promise.resolve(routeCtx?.params).then((p) => handler(req, mockAuthCtx, p ?? {})),
}))

jest.mock('@/lib/modules', () => ({
  assertModuleEnabled: jest.fn().mockResolvedValue(undefined),
  ModuleDisabledError: class ModuleDisabledError extends Error {},
}))

jest.mock('@/lib/audit', () => ({ recordAudit: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/jobs/dispatch', () => ({ enqueueJob: jest.fn().mockResolvedValue(undefined) }))

// eslint-disable-next-line no-var
var advanceSpy = jest.fn().mockResolvedValue(undefined)
jest.mock('@/services/compliance', () => {
  const actual = jest.requireActual('@/services/compliance')
  return { ...actual, maybeAdvanceOnboarding: (...a: unknown[]) => advanceSpy(...a) }
})

jest.mock('@/lib/supabase-server', () => {
  function table(name: keyof MockState) {
    const filters: Array<(r: any) => boolean> = []
    const rows = () => state[name].filter((r) => filters.every((f) => f(r)))
    const builder: any = {
      select: () => builder,
      // order is chainable (not terminal); the query is awaited via `then`.
      order: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val)
        return builder
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => (vals as unknown[]).includes(r[col]))
        return builder
      },
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null }),
      single: () => {
        const found = state[name].filter((r) => filters.every((f) => f(r)))[0] ?? null
        return Promise.resolve({ data: found, error: found ? null : { message: 'no row' } })
      },
      maybeSingle: () => {
        const found = state[name].filter((r) => filters.every((f) => f(r)))[0] ?? null
        return Promise.resolve({ data: found, error: null })
      },
      insert: (row: any) => {
        const created = { id: `${name}-${state[name].length + 1}`, ...row }
        state[name].push(created)
        return { select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }) }
      },
    }
    return builder
  }
  return { supabaseAdmin: { from: (name: keyof MockState) => table(name) } }
})

import { GET, POST } from '@/app/api/certifications/route'

function resetState() {
  state.cert_types = [
    { id: CT1, company_id: 'co1', validity_months: 12, reminder_offsets: [30, 7], required: true },
  ]
  state.certifications = []
  state.history = []
  state.employees = [
    { id: E1, company_id: 'co1', reports_to: null },
    { id: E2, company_id: 'co1', reports_to: MGR1 },
    { id: E3, company_id: 'co1', reports_to: MGR1 },
  ]
}

const hr = { companyId: 'co1', role: 'hr', appUser: { id: 'u1' }, employee: { id: E1 } }

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/certifications', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const callPost = (req: NextRequest) =>
  (POST as unknown as (r: NextRequest, c: { params: Promise<unknown> }) => Promise<Response>)(req, {
    params: Promise.resolve({}),
  })
const callGet = (url: string) =>
  (GET as unknown as (r: NextRequest, c: { params: Promise<unknown> }) => Promise<Response>)(
    new NextRequest(url),
    { params: Promise.resolve({}) },
  )

beforeEach(() => {
  resetState()
  advanceSpy.mockClear()
  mockAuthCtx = { ...hr }
})

describe('POST /api/certifications', () => {
  it('auto-derives expiry from a 12mo type and caches valid status', async () => {
    const res = await callPost(
      postReq({ employee_id: E1, cert_type_id: CT1, title: 'First Aid', completion_date: '2099-01-15' }),
    )
    expect(res.status).toBe(201)
    const cert = state.certifications[0]
    expect(cert.expiry_date).toBe('2100-01-15') // completion + 12 months
    expect(cert.status).toBe('valid')
    expect(state.history.find((h) => h.action === 'created')).toBeTruthy()
  })

  it('caches expired status for a past completion + short validity', async () => {
    await callPost(
      postReq({ employee_id: E1, cert_type_id: CT1, title: 'First Aid', completion_date: '2000-01-15' }),
    )
    expect(state.certifications[0].status).toBe('expired')
  })

  it('advances onboarding for a required cert type', async () => {
    await callPost(
      postReq({ employee_id: E1, cert_type_id: CT1, title: 'First Aid', completion_date: '2099-01-15' }),
    )
    expect(advanceSpy).toHaveBeenCalledWith(E1)
  })

  it('rejects an unknown cert type as a validation error', async () => {
    const res = await callPost(postReq({ employee_id: E1, cert_type_id: UNKNOWN, title: 'X' }))
    expect(res.status).toBe(400)
  })

  it('rejects a missing title (strict schema)', async () => {
    const res = await callPost(postReq({ employee_id: E1, cert_type_id: CT1 }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/certifications scope rules', () => {
  it('scope=all requires hr+ (manager forbidden)', async () => {
    mockAuthCtx = { companyId: 'co1', role: 'manager', appUser: { id: 'm' }, employee: { id: MGR1 } }
    const res = await callGet('http://t/api/certifications?scope=all')
    expect(res.status).toBe(403)
  })

  it('scope=team requires manager+ (employee forbidden)', async () => {
    mockAuthCtx = { companyId: 'co1', role: 'employee', appUser: { id: 'x' }, employee: { id: E2 } }
    const res = await callGet('http://t/api/certifications?scope=team')
    expect(res.status).toBe(403)
  })

  it('scope=my returns only the callers own certs', async () => {
    state.certifications = [
      { id: 'x1', company_id: 'co1', employee_id: E1, expiry_date: null, title: 'A' },
      { id: 'x2', company_id: 'co1', employee_id: E2, expiry_date: null, title: 'B' },
    ]
    mockAuthCtx = { companyId: 'co1', role: 'employee', appUser: { id: 'u1' }, employee: { id: E1 } }
    const res = await callGet('http://t/api/certifications?scope=my')
    const json = await res.json()
    expect(json.certifications).toHaveLength(1)
    expect(json.certifications[0].employee_id).toBe(E1)
    expect(json.certifications[0].indicator).toBe('green')
  })

  it('scope=team returns direct reports only', async () => {
    state.certifications = [
      { id: 'x2', company_id: 'co1', employee_id: E2, expiry_date: null, title: 'B' },
      { id: 'x3', company_id: 'co1', employee_id: E3, expiry_date: null, title: 'C' },
      { id: 'x1', company_id: 'co1', employee_id: E1, expiry_date: null, title: 'A' },
    ]
    mockAuthCtx = { companyId: 'co1', role: 'manager', appUser: { id: 'm' }, employee: { id: MGR1 } }
    const res = await callGet('http://t/api/certifications?scope=team')
    const json = await res.json()
    const ids = json.certifications.map((r: any) => r.employee_id).sort()
    expect(ids).toEqual([E2, E3])
  })

  it('rejects an invalid scope', async () => {
    const res = await callGet('http://t/api/certifications?scope=bogus')
    expect(res.status).toBe(400)
  })
})
