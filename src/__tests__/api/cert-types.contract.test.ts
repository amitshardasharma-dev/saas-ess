/**
 * @jest-environment node
 *
 * Contract tests for /api/cert-types — input validation + reminder defaults.
 * withAuth is mocked to inject a controllable AuthContext; supabaseAdmin and the
 * module gate are stubbed so the test focuses on the handler's own logic.
 */
import { NextRequest } from 'next/server'

// --- mock auth: withAuth simply invokes the handler with a controllable ctx ---
// eslint-disable-next-line no-var
var mockAuthCtx: Record<string, unknown> = { companyId: 'co1', role: 'hr', appUser: { id: 'u1' }, employee: { id: 'e1' } }
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

// eslint-disable-next-line no-var
var mockInsertedRow: Record<string, unknown> | null = null
jest.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: {
    from: () => {
      const chain: Record<string, unknown> = {}
      const passthrough = ['select', 'eq', 'order']
      passthrough.forEach((m) => {
        chain[m] = () => chain
      })
      chain.insert = (row: Record<string, unknown>) => {
        mockInsertedRow = row
        return {
          select: () => ({ single: () => Promise.resolve({ data: { id: 'ct1', ...row }, error: null }) }),
        }
      }
      ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: [], error: null })
      return chain
    },
  },
}))

import { POST } from '@/app/api/cert-types/route'

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/cert-types', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const call = (req: NextRequest) =>
  (POST as unknown as (r: NextRequest, c: { params: Promise<unknown> }) => Promise<Response>)(req, {
    params: Promise.resolve({}),
  })

describe('POST /api/cert-types validation', () => {
  beforeEach(() => {
    mockInsertedRow = null
    mockAuthCtx = { companyId: 'co1', role: 'hr', appUser: { id: 'u1' }, employee: { id: 'e1' } }
  })

  it('rejects negative validity_months', async () => {
    const res = await call(postReq({ name: 'Police Check', validity_months: -5 }))
    expect(res.status).toBe(400)
    expect(mockInsertedRow).toBeNull()
  })

  it('rejects negative reminder_offsets', async () => {
    const res = await call(postReq({ name: 'Police Check', reminder_offsets: [30, -1] }))
    expect(res.status).toBe(400)
  })

  it('rejects a missing name', async () => {
    const res = await call(postReq({ validity_months: 12 }))
    expect(res.status).toBe(400)
  })

  it('rejects unknown fields (strict schema)', async () => {
    const res = await call(postReq({ name: 'X', surprise: true }))
    expect(res.status).toBe(400)
  })

  it('accepts a valid payload and defaults reminder_offsets to {90,30,7}', async () => {
    const res = await call(postReq({ name: 'Police Check', validity_months: 36 }))
    expect(res.status).toBe(201)
    expect(mockInsertedRow).not.toBeNull()
    expect(mockInsertedRow!.reminder_offsets).toEqual([90, 30, 7])
    expect(mockInsertedRow!.company_id).toBe('co1')
  })

  it('accepts null validity (never expires)', async () => {
    const res = await call(postReq({ name: 'Eternal', validity_months: null }))
    expect(res.status).toBe(201)
  })
})
