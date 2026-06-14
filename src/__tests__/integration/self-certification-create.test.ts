/**
 * @jest-environment node
 *
 * Self-scoped certification create (/api/profile/certifications POST).
 *
 * Proves the security contract of the volunteer-facing endpoint:
 *   1. employee_id is FORCED to the caller's own employee record. A malicious
 *      employee_id in the request body is IGNORED — the inserted cert (and the
 *      onboarding auto-complete) target the caller, never the body value.
 *   2. The full create path runs: cert-type validity is read, expiry is derived,
 *      the cert row is inserted, and the linked onboarding 'certification' step
 *      is auto-completed (flipped to 'done') for the caller.
 *
 * Mirrors the supabase mock pattern in compliance-idor.test.ts, but both the
 * data client (@/lib/supabase-server) and the side-effect client
 * (@/lib/supabase-admin — used by audit/history/onboarding) share ONE call-
 * tracking store so the onboarding write is observable.
 */
import { NextRequest } from 'next/server'

const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const EMP_SELF = 'self-employee-id'
const CERT_TYPE_ID = '11111111-1111-1111-1111-111111111111'
const ATTACKER_EMP_ID = 'victim-employee-id'
const NEW_CERT_ID = 'newcert-id'
const ONBOARDING_STEP_ID = 'onboarding-step-id'

interface Builder {
  table: string
  calls: { method: string; args: unknown[] }[]
}

jest.mock('@/lib/modules', () => ({
  assertModuleEnabled: jest.fn().mockResolvedValue(undefined),
  ModuleDisabledError: class ModuleDisabledError extends Error {},
}))

// Shared mock factory — one store, used by BOTH supabase-server (route data) and
// supabase-admin (audit/history/onboarding side-effects).
const sharedMock = (() => {
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

    const hasEq = (col: string) => calls.some((c) => c.method === 'eq' && c.args[0] === col)
    const isInsert = () => calls.some((c) => c.method === 'insert')
    const isUpdate = () => calls.some((c) => c.method === 'update')

    const resolveResult = () => {
      // Auth identity lookups -> the caller (company A, role employee).
      if (table === 'ess_app_users' && hasEq('auth_user_id')) {
        return {
          data: { id: 'appuser-self', company_id: COMPANY_A, role: 'employee', is_active: true },
          error: null,
        }
      }
      if (table === 'ess_employees' && hasEq('app_user_id')) {
        return {
          data: { id: EMP_SELF, full_name: 'Self', company_id: COMPANY_A, is_approver: false },
          error: null,
        }
      }
      // Cert type resolve (validity for expiry derivation).
      if (table === 'ess_cert_types' && hasEq('id')) {
        return { data: { id: CERT_TYPE_ID, validity_months: 12 }, error: null }
      }
      // Cert insert -> the created row (route reads .select().single()).
      if (table === 'ess_certifications' && isInsert()) {
        const payload = (calls.find((c) => c.method === 'insert')?.args[0] ?? {}) as Record<string, unknown>
        return { data: { id: NEW_CERT_ID, ...payload }, error: null }
      }
      // Onboarding: a single pending auto_complete step matching the link.
      if (table === 'ess_onboarding_steps' && !isUpdate() && hasEq('ref_id')) {
        return { data: [{ id: ONBOARDING_STEP_ID, status: 'pending' }], error: null }
      }
      // advanceOnboarding: all steps (status) + the state row.
      if (table === 'ess_onboarding_steps') {
        return { data: [{ status: 'done' }], error: null }
      }
      if (table === 'ess_onboarding_states') {
        return { data: { id: 'state-1', status: 'in_progress', blocked_reason: null }, error: null }
      }
      // history / audit inserts and everything else -> succeed.
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
    client: {
      auth: { getUser: (...args: unknown[]) => getUser(...args) },
      from: (table: string) => makeBuilder(table),
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
    },
    state,
    getUser,
  }
})()

jest.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: sharedMock.client,
  __state: sharedMock.state,
  __getUser: sharedMock.getUser,
}))

jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: sharedMock.client,
}))

const mockState = sharedMock.state
const mockGetUser = sharedMock.getUser

function authedReq(url: string, method = 'POST', body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer faketoken', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

function lastBuilder(table: string): Builder | undefined {
  return [...mockState.builders].reverse().find((b) => b.table === table)
}

describe('Self certification create — body employee_id is ignored, caller scoped', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockState.builders.length = 0
    mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-self', email: 'self@x.com' } }, error: null })
  })

  it('forces employee_id to the caller and runs the create + onboarding auto-complete', async () => {
    const { POST } = await import('@/app/api/profile/certifications/route')

    const res = await POST(
      authedReq('http://t/api/profile/certifications', 'POST', {
        // Attacker tries to attach the cert to someone else — must be ignored.
        employee_id: ATTACKER_EMP_ID,
        cert_type_id: CERT_TYPE_ID,
        title: 'First Aid',
        completion_date: '2026-01-15',
      }),
      { params: Promise.resolve({}) } as never,
    )

    expect(res.status).toBe(201)

    // (1) The cert insert used the CALLER's employee id, not the body value.
    const certBuilder = lastBuilder('ess_certifications')
    expect(certBuilder).toBeDefined()
    const insertCall = certBuilder!.calls.find((c) => c.method === 'insert')
    expect(insertCall).toBeDefined()
    const payload = insertCall!.args[0] as Record<string, unknown>
    expect(payload.employee_id).toBe(EMP_SELF)
    expect(payload.employee_id).not.toBe(ATTACKER_EMP_ID)
    expect(payload.company_id).toBe(COMPANY_A)
    expect(payload.cert_type_id).toBe(CERT_TYPE_ID)
    // Expiry derived from completion (2026-01-15) + validity 12 months.
    expect(payload.expiry_date).toBe('2027-01-15')

    // (2) The onboarding auto-complete ran against the CALLER's own step:
    //     the matching step lookup was keyed on the caller's employee id,
    const stepBuilders = mockState.builders.filter((b) => b.table === 'ess_onboarding_steps')
    expect(stepBuilders.length).toBeGreaterThan(0)
    const lookup = stepBuilders.find((b) =>
      b.calls.some((c) => c.method === 'eq' && c.args[0] === 'employee_id' && c.args[1] === EMP_SELF) &&
      b.calls.some((c) => c.method === 'eq' && c.args[0] === 'ref_id' && c.args[1] === CERT_TYPE_ID),
    )
    expect(lookup).toBeDefined()
    //     and the pending step was flipped to done.
    const flip = stepBuilders.find((b) =>
      b.calls.some(
        (c) =>
          c.method === 'update' &&
          (c.args[0] as Record<string, unknown>)?.status === 'done',
      ),
    )
    expect(flip).toBeDefined()

    // The response echoes the created cert with derived fields.
    const json = await res.json()
    expect(json.certification.id).toBe(NEW_CERT_ID)
    expect(json.certification.employee_id).toBe(EMP_SELF)
    expect(json.certification.indicator).toBe('green')
  })

  it('rejects invalid input (missing cert_type_id) with 400 and writes nothing', async () => {
    const { POST } = await import('@/app/api/profile/certifications/route')

    const res = await POST(
      authedReq('http://t/api/profile/certifications', 'POST', {
        title: 'No type',
        completion_date: '2026-01-15',
      }),
      { params: Promise.resolve({}) } as never,
    )

    expect(res.status).toBe(400)
    const certBuilder = lastBuilder('ess_certifications')
    expect(certBuilder).toBeUndefined()
  })
})
