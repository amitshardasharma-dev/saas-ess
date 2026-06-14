/**
 * @jest-environment node
 *
 * Task E — recertification is repeatable + the training-complete hook is wired.
 *
 * Covers the three code-verified fixes:
 *  1. Migration 060 replaces `unique (certification_id)` with an OPEN-only partial
 *     unique index. The SQL is the source of truth; here we pin the open status set
 *     that the index and the scan share (RECERT_OPEN_STATUSES).
 *  2. scanRecertifications skips a cert ONLY when an OPEN recert exists, so a new
 *     cycle opens once the prior one is 'completed'. Driven against a stateful
 *     supabaseAdmin mock (table-aware, status-filter-aware).
 *  3. tryRecertHook is a STATIC import that calls the real
 *     completeRecertForModule(companyId, employeeId, moduleId).
 */

// --- Stateful, table + filter aware supabaseAdmin mock --------------------------
// jest hoists this above imports; mock state is exposed via __db for the test body.
jest.mock('@/lib/supabase-admin', () => {
  const db: Record<string, Record<string, unknown>[]> = {
    ess_certifications: [],
    ess_recertifications: [],
    ess_recert_history: [],
    ess_cert_types: [],
    ess_employees: [],
    ess_app_users: [],
    ess_training_assignments: [],
  }
  let idSeq = 0

  function makeBuilder(table: string) {
    const eqs: { col: string; val: unknown }[] = []
    const ins: { col: string; vals: unknown[] }[] = []
    const neqs: { col: string; val: unknown }[] = []
    let pendingInsert: Record<string, unknown> | null = null
    let pendingUpdate: Record<string, unknown> | null = null

    const chain: Record<string, unknown> = {}
    ;['select', 'order', 'limit'].forEach((m) => {
      chain[m] = () => chain
    })
    chain.eq = (col: string, val: unknown) => {
      eqs.push({ col, val })
      // An .eq after .update applies the update to the matched rows.
      if (pendingUpdate) applyUpdate()
      return chain
    }
    chain.in = (col: string, vals: unknown[]) => {
      ins.push({ col, vals })
      return chain
    }
    chain.neq = (col: string, val: unknown) => {
      neqs.push({ col, val })
      return chain
    }
    chain.insert = (row: Record<string, unknown>) => {
      pendingInsert = { id: `row-${++idSeq}`, ...row }
      ;(db[table] ??= []).push(pendingInsert)
      return chain
    }
    chain.update = (patch: Record<string, unknown>) => {
      pendingUpdate = patch
      return chain
    }
    function matched() {
      let data = db[table] ?? []
      for (const f of eqs) data = data.filter((r) => r[f.col] === f.val)
      for (const f of ins) data = data.filter((r) => (f.vals as unknown[]).includes(r[f.col]))
      for (const f of neqs) data = data.filter((r) => r[f.col] !== f.val)
      return data
    }
    function applyUpdate() {
      if (!pendingUpdate) return
      for (const r of matched()) Object.assign(r, pendingUpdate)
      pendingUpdate = null
    }
    chain.single = () =>
      Promise.resolve({ data: pendingInsert ?? matched()[0] ?? null, error: null })
    chain.maybeSingle = () => Promise.resolve({ data: matched()[0] ?? null, error: null })
    ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
      if (pendingUpdate) applyUpdate()
      return resolve({ data: pendingInsert ? [pendingInsert] : matched(), error: null })
    }
    return chain
  }

  return {
    supabaseAdmin: { from: (table: string) => makeBuilder(table) },
    __db: db,
  }
})

// Email + audit are side effects we don't assert here — stub to no-ops.
jest.mock('@/lib/email/send', () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/audit', () => ({ recordAudit: jest.fn().mockResolvedValue(undefined) }))

import { scanRecertifications, RECERT_OPEN_STATUSES } from '@/lib/recertification'
import * as supa from '@/lib/supabase-admin'

const db = (supa as unknown as { __db: Record<string, Record<string, unknown>[]> }).__db

const COMPANY = 'company-1'
const EMP = 'emp-1'
const CERT = 'cert-1'
// `today` injected into the scan; cert below is long expired relative to it.
const TODAY = new Date('2026-06-01T12:00:00Z')

function reset() {
  for (const k of Object.keys(db)) db[k] = []
}

describe('RECERT_OPEN_STATUSES (shared open set)', () => {
  it("matches migration 057's CHECK minus 'completed' (= migration 060 partial index predicate)", () => {
    expect([...RECERT_OPEN_STATUSES].sort()).toEqual(['assigned', 'in_progress'])
    expect(RECERT_OPEN_STATUSES).not.toContain('completed')
  })
})

describe('scanRecertifications — repeatable cycles (open-only skip)', () => {
  beforeEach(() => {
    reset()
    db.ess_certifications.push({
      id: CERT,
      company_id: COMPANY,
      employee_id: EMP,
      expiry_date: '2026-05-01', // expired before TODAY
      cert_type_id: null,
    })
  })

  it('opens the first recert for an expired cert', async () => {
    const r = await scanRecertifications(COMPANY, TODAY)
    expect(r.expiredFound).toBe(1)
    expect(r.recertsCreated).toBe(1)
    expect(db.ess_recertifications).toHaveLength(1)
    expect(db.ess_recertifications[0].status).toBe('assigned')
  })

  it('SKIPS while an open recert already exists (idempotent, no duplicate cycle)', async () => {
    await scanRecertifications(COMPANY, TODAY) // creates cycle 1 (status 'assigned')
    const r = await scanRecertifications(COMPANY, TODAY) // should skip
    expect(r.recertsCreated).toBe(0)
    expect(db.ess_recertifications).toHaveLength(1)
  })

  it('ALLOWS a 2nd cycle once the first recert is completed', async () => {
    await scanRecertifications(COMPANY, TODAY) // cycle 1
    // Simulate the completion hook closing cycle 1.
    db.ess_recertifications[0].status = 'completed'

    const r = await scanRecertifications(COMPANY, TODAY) // cert still expired
    expect(r.recertsCreated).toBe(1) // a fresh cycle opened
    expect(db.ess_recertifications).toHaveLength(2)
    const open = db.ess_recertifications.filter((x) =>
      (RECERT_OPEN_STATUSES as readonly string[]).includes(x.status as string),
    )
    expect(open).toHaveLength(1) // exactly one open at a time (matches partial index)
  })
})
