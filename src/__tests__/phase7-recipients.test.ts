// Phase 7 — targeted-delivery recipient resolution tests. Uses an injected DB port
// (no env/network). Verifies each target type resolves the right employee set and
// that the union is deduped.

import { resolveRecipients, type RecipientDbPort, type ResolveTarget } from '@/lib/communications/resolve-recipients'

const COMPANY = 'co-1'

function makeDb(): RecipientDbPort {
  const employees = [
    { id: 'e1', app_user_id: 'u1', department: 'Care', is_active: true, company_id: COMPANY },
    { id: 'e2', app_user_id: 'u2', department: 'Care', is_active: true, company_id: COMPANY },
    { id: 'e3', app_user_id: 'u3', department: 'Admin', is_active: true, company_id: COMPANY },
    { id: 'e4', app_user_id: 'u4', department: 'Care', is_active: false, company_id: COMPANY },
  ]
  const appUsers = [
    { id: 'u1', role: 'employee', company_id: COMPANY },
    { id: 'u2', role: 'employee', company_id: COMPANY },
    { id: 'u3', role: 'admin', company_id: COMPANY },
  ]
  const groupMembers = [
    { employee_id: 'e2', group_id: 'g1', company_id: COMPANY },
    { employee_id: 'e3', group_id: 'g1', company_id: COMPANY },
  ]

  function matches(row: Record<string, unknown>, eq: Record<string, unknown>): boolean {
    return Object.entries(eq).every(([k, v]) => row[k] === v)
  }

  return {
    async select(table, eq) {
      const src =
        table === 'ess_employees'
          ? employees
          : table === 'ess_app_users'
            ? appUsers
            : table === 'ess_training_group_members'
              ? groupMembers
              : []
      return { data: src.filter((r) => matches(r, eq)) }
    },
  }
}

describe('phase7 resolveRecipients', () => {
  it("'all' returns only active employees", async () => {
    const ids = await resolveRecipients(makeDb(), COMPANY, [{ target_type: 'all' }])
    expect(ids.sort()).toEqual(['e1', 'e2', 'e3'])
  })

  it("'org_unit' filters by department", async () => {
    const ids = await resolveRecipients(makeDb(), COMPANY, [{ target_type: 'org_unit', target_value: 'Care' }])
    expect(ids.sort()).toEqual(['e1', 'e2'])
  })

  it("'role' resolves via app_users", async () => {
    const ids = await resolveRecipients(makeDb(), COMPANY, [{ target_type: 'role', target_value: 'admin' }])
    expect(ids).toEqual(['e3'])
  })

  it("'group' resolves Phase 5 training group membership", async () => {
    const ids = await resolveRecipients(makeDb(), COMPANY, [{ target_type: 'group', target_value: 'g1' }])
    expect(ids.sort()).toEqual(['e2', 'e3'])
  })

  it("'user' resolves a single employee", async () => {
    const ids = await resolveRecipients(makeDb(), COMPANY, [{ target_type: 'user', target_value: 'e1' }])
    expect(ids).toEqual(['e1'])
  })

  it('unions multiple targets and dedupes', async () => {
    const targets: ResolveTarget[] = [
      { target_type: 'org_unit', target_value: 'Care' }, // e1, e2
      { target_type: 'group', target_value: 'g1' }, // e2, e3
    ]
    const ids = await resolveRecipients(makeDb(), COMPANY, targets)
    expect(ids.sort()).toEqual(['e1', 'e2', 'e3'])
  })
})
