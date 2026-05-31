/**
 * @jest-environment node
 *
 * Cross-tenant (IDOR) denial for the Phase 3 certification routes. A tenant-B
 * caller asks for a tenant-A certification by id. Because every route scopes its
 * lookup by the caller's company_id, the scoped query finds no row and the
 * handler returns 404 (never leaking existence). This mirrors the Phase 0
 * idor-regression harness.
 */
import { NextRequest } from 'next/server'

const COMPANY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

interface Builder {
  table: string
  calls: { method: string; args: unknown[] }[]
}

jest.mock('@/lib/modules', () => ({
  assertModuleEnabled: jest.fn().mockResolvedValue(undefined),
  ModuleDisabledError: class ModuleDisabledError extends Error {},
}))

jest.mock('@/lib/supabase-server', () => {
  const authResults: Record<string, { data: unknown; error: unknown }> = {
    ess_app_users: {
      data: { id: 'appuser-b', company_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role: 'hr', is_active: true },
      error: null,
    },
    ess_employees: {
      data: { id: 'employee-b', full_name: 'B', is_approver: true, company_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
      error: null,
    },
  }
  const state: { builders: Builder[] } = { builders: [] }
  const getUser = jest.fn()

  function makeBuilder(table: string) {
    const calls: { method: string; args: unknown[] }[] = []
    state.builders.push({ table, calls })
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'lte', 'order', 'limit', 'in']
    methods.forEach((m) => {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args })
        return chain
      }
    })
    const resolveResult = () => {
      const hasEq = (col: string) => calls.some((c) => c.method === 'eq' && c.args[0] === col)
      // Auth middleware identity lookups must return tenant-B; any other lookup
      // (the cross-tenant target by id/company_id) resolves to null -> 404.
      if (table === 'ess_app_users' && hasEq('auth_user_id')) return authResults.ess_app_users
      if (table === 'ess_employees' && hasEq('app_user_id')) return authResults.ess_employees
      return { data: null, error: null }
    }
    const terminal = (...args: unknown[]) => {
      calls.push({ method: 'single', args })
      return Promise.resolve(resolveResult())
    }
    chain.single = terminal
    chain.maybeSingle = terminal
    ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(resolveResult())
    return chain
  }

  return {
    supabaseAdmin: {
      auth: { getUser: (...args: unknown[]) => getUser(...args) },
      from: (table: string) => makeBuilder(table),
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
    },
    __state: state,
    __getUser: getUser,
  }
})

import * as supa from '@/lib/supabase-server'

const mockState = (supa as unknown as { __state: { builders: Builder[] } }).__state
const mockGetUser = (supa as unknown as { __getUser: jest.Mock }).__getUser

function authedReq(url: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer faketoken', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

function assertScopedToCompanyB(table: string) {
  const b = [...mockState.builders].reverse().find((x) => x.table === table)
  expect(b).toBeDefined()
  const scoped = b!.calls.some(
    (c) => c.method === 'eq' && c.args[0] === 'company_id' && c.args[1] === COMPANY_B,
  )
  expect(scoped).toBe(true)
}

const uuidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('Compliance IDOR — tenant-B token gets 404 on tenant-A certification ids', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockState.builders.length = 0
    mockGetUser.mockResolvedValue({ data: { user: { id: 'authB', email: 'b@x.com' } }, error: null })
  })

  it('PATCH /certifications/[id] is scoped by company_id', async () => {
    const { PATCH } = await import('@/app/api/certifications/[id]/route')
    const res = await PATCH(authedReq(`http://t/api/certifications/${uuidA}`, 'PATCH', { notes: 'x' }), {
      params: Promise.resolve({ id: uuidA }),
    } as never)
    expect(res.status).toBe(404)
    assertScopedToCompanyB('ess_certifications')
  })

  it('DELETE /certifications/[id] is scoped by company_id', async () => {
    const { DELETE } = await import('@/app/api/certifications/[id]/route')
    const res = await DELETE(authedReq(`http://t/api/certifications/${uuidA}`, 'DELETE'), {
      params: Promise.resolve({ id: uuidA }),
    } as never)
    expect(res.status).toBe(404)
    assertScopedToCompanyB('ess_certifications')
  })

  it('GET /certifications/[id]/file (download) is scoped by company_id', async () => {
    const { GET } = await import('@/app/api/certifications/[id]/file/route')
    const res = await GET(authedReq(`http://t/api/certifications/${uuidA}/file`), {
      params: Promise.resolve({ id: uuidA }),
    } as never)
    expect(res.status).toBe(404)
    assertScopedToCompanyB('ess_certifications')
  })
})
