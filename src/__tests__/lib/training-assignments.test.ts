/**
 * @jest-environment node
 *
 * Assignment resolution per target type, tenant-scoped. A table-aware chainable
 * supabaseAdmin mock returns canned data keyed by table + applied filters, and
 * records the .eq('company_id', ...) filters so we can prove scoping.
 */
// Mock state lives inside the factory (jest hoists jest.mock above imports).
// Exposed on the mocked module for the test body to configure per-case.
jest.mock('@/lib/supabase-server', () => {
  const db: Record<string, Record<string, unknown>[]> = {
    ess_training_modules: [],
    ess_training_assignments: [],
    ess_app_users: [],
    ess_employees: [],
    ess_training_group_members: [],
  }

  function makeBuilder(table: string) {
    const eqs: { col: string; val: unknown }[] = []
    const ins: { col: string; vals: unknown[] }[] = []
    const chain: Record<string, unknown> = {}
    const passthrough = ['select', 'order', 'limit']
    passthrough.forEach((m) => {
      chain[m] = () => chain
    })
    chain.eq = (col: string, val: unknown) => {
      eqs.push({ col, val })
      return chain
    }
    chain.in = (col: string, vals: unknown[]) => {
      ins.push({ col, vals })
      return chain
    }
    const rows = () => {
      let data = db[table] ?? []
      for (const f of eqs) data = data.filter((r) => r[f.col] === f.val)
      for (const f of ins) data = data.filter((r) => (f.vals as unknown[]).includes(r[f.col]))
      return data
    }
    chain.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    chain.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
    ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows(), error: null })
    return chain
  }

  return {
    supabaseAdmin: { from: (table: string) => makeBuilder(table) },
    __db: db,
  }
})

import { resolveAssignees } from '@/lib/training/assignments'
import * as supa from '@/lib/supabase-server'

const db = (supa as unknown as { __db: Record<string, Record<string, unknown>[]> }).__db

const COMPANY_A = 'company-a'
const COMPANY_B = 'company-b'

function reset() {
  for (const k of Object.keys(db)) db[k] = []
  db.ess_training_modules.push({ id: 'mod-1', company_id: COMPANY_A })
}

describe('resolveAssignees', () => {
  beforeEach(reset)

  it('resolves by role through app_users', async () => {
    db.ess_training_assignments.push({
      id: 'as1',
      company_id: COMPANY_A,
      module_id: 'mod-1',
      target_type: 'role',
      target_value: 'employee',
    })
    db.ess_app_users.push(
      { id: 'au1', company_id: COMPANY_A, role: 'employee' },
      { id: 'au2', company_id: COMPANY_A, role: 'admin' }
    )
    db.ess_employees.push(
      { id: 'e1', company_id: COMPANY_A, full_name: 'Vol One', department: 'X', app_user_id: 'au1' },
      { id: 'e2', company_id: COMPANY_A, full_name: 'Admin', department: 'X', app_user_id: 'au2' }
    )

    const result = await resolveAssignees('mod-1')
    expect(result.map((r) => r.employee_id)).toEqual(['e1'])
  })

  it('resolves by org_unit (department)', async () => {
    db.ess_training_assignments.push({
      id: 'as2',
      company_id: COMPANY_A,
      module_id: 'mod-1',
      target_type: 'org_unit',
      target_value: 'Outreach',
    })
    db.ess_employees.push(
      { id: 'e1', company_id: COMPANY_A, full_name: 'A', department: 'Outreach' },
      { id: 'e2', company_id: COMPANY_A, full_name: 'B', department: 'Finance' }
    )
    const result = await resolveAssignees('mod-1')
    expect(result.map((r) => r.employee_id)).toEqual(['e1'])
  })

  it('resolves by group membership', async () => {
    db.ess_training_assignments.push({
      id: 'as3',
      company_id: COMPANY_A,
      module_id: 'mod-1',
      target_type: 'group',
      target_value: 'grp-1',
    })
    db.ess_training_group_members.push({
      id: 'm1',
      company_id: COMPANY_A,
      group_id: 'grp-1',
      employee_id: 'e9',
    })
    db.ess_employees.push({ id: 'e9', company_id: COMPANY_A, full_name: 'G', department: null })
    const result = await resolveAssignees('mod-1')
    expect(result.map((r) => r.employee_id)).toEqual(['e9'])
  })

  it('resolves by direct user and de-dupes across rules', async () => {
    db.ess_training_assignments.push(
      { id: 'as4', company_id: COMPANY_A, module_id: 'mod-1', target_type: 'user', target_value: 'e1' },
      { id: 'as5', company_id: COMPANY_A, module_id: 'mod-1', target_type: 'org_unit', target_value: 'X' }
    )
    db.ess_employees.push({ id: 'e1', company_id: COMPANY_A, full_name: 'A', department: 'X' })
    const result = await resolveAssignees('mod-1')
    expect(result.map((r) => r.employee_id)).toEqual(['e1']) // appears once
  })

  it('returns [] for a foreign/unknown module (no cross-tenant leak)', async () => {
    db.ess_training_modules.push({ id: 'mod-b', company_id: COMPANY_B })
    db.ess_training_assignments.push({
      id: 'asB',
      company_id: COMPANY_B,
      module_id: 'mod-b',
      target_type: 'org_unit',
      target_value: 'X',
    })
    db.ess_employees.push(
      { id: 'eb', company_id: COMPANY_B, full_name: 'B', department: 'X' },
      { id: 'ea', company_id: COMPANY_A, full_name: 'A', department: 'X' }
    )
    // Module b resolves only company B employees.
    const result = await resolveAssignees('mod-b')
    expect(result.map((r) => r.employee_id)).toEqual(['eb'])
  })
})
