// src/lib/communications/resolve-recipients.ts
//
// Phase 7 — resolve targeted-delivery audiences to a concrete set of employee ids.
//
// Target types (per spec §4.2 / migration 055):
//   - 'all'      -> every active employee in the tenant
//   - 'role'     -> employees whose app_user.role matches target_value
//   - 'org_unit' -> employees whose department matches target_value
//   - 'group'    -> members of a Phase 5 training group (ess_training_group_members)
//   - 'user'     -> a single employee (target_value = employee id)
//
// Cross-phase note: training groups are a Phase 5 contract. We read them defensively
// (try/catch) so a tenant without the LMS merged still resolves the other target
// types. The DB accessor is injected so this is unit-testable with a small fake.

export interface ResolveTarget {
  target_type: 'role' | 'org_unit' | 'group' | 'user' | 'all'
  target_value?: string | null
}

/** Result of a single table fetch: rows or empty on error. */
export type FetchResult = { data: Record<string, unknown>[] | null }

/**
 * Minimal DB port. `select` returns the rows for `table` already filtered by the
 * given equality predicates (all ANDed). This keeps the resolver independent of the
 * concrete supabase-js builder type and trivial to mock in tests.
 */
export interface RecipientDbPort {
  select: (table: string, eq: Record<string, unknown>) => Promise<FetchResult>
}

/**
 * Resolve a list of targets into a deduped set of employee ids for one tenant.
 * Always scoped to `companyId`. Unknown/empty targets contribute nothing.
 */
export async function resolveRecipients(
  db: RecipientDbPort,
  companyId: string,
  targets: ResolveTarget[],
): Promise<string[]> {
  const ids = new Set<string>()

  // An employee is "active" when their app_user is active. NOTE: ess_employees has
  // NO is_active column — that flag lives on ess_app_users — so we MUST gate through
  // the app_user, not filter employees by is_active (which silently matched nothing
  // and made every targeted send resolve to zero recipients).
  let activeUserIds: Set<string> | null = null
  const getActiveUserIds = async (): Promise<Set<string>> => {
    if (!activeUserIds) {
      const { data } = await db.select('ess_app_users', { company_id: companyId, is_active: true })
      activeUserIds = new Set((data ?? []).map((u) => String(u.id)))
    }
    return activeUserIds
  }
  const isActiveEmployee = (e: Record<string, unknown>, active: Set<string>): boolean => {
    const auId = e.app_user_id != null ? String(e.app_user_id) : null
    return auId != null && active.has(auId)
  }

  for (const t of targets) {
    switch (t.target_type) {
      case 'all': {
        const active = await getActiveUserIds()
        const { data } = await db.select('ess_employees', { company_id: companyId })
        for (const e of data ?? []) if (isActiveEmployee(e, active)) ids.add(String(e.id))
        break
      }
      case 'org_unit': {
        if (!t.target_value) break
        const active = await getActiveUserIds()
        const { data } = await db.select('ess_employees', {
          company_id: companyId,
          department: t.target_value,
        })
        for (const e of data ?? []) if (isActiveEmployee(e, active)) ids.add(String(e.id))
        break
      }
      case 'user': {
        if (t.target_value) ids.add(t.target_value)
        break
      }
      case 'role': {
        if (!t.target_value) break
        const { data: users } = await db.select('ess_app_users', { company_id: companyId, role: t.target_value, is_active: true })
        const userIds = new Set((users ?? []).map((u) => String(u.id)))
        if (userIds.size === 0) break
        const { data: emps } = await db.select('ess_employees', { company_id: companyId })
        for (const e of emps ?? []) {
          const auId = e.app_user_id != null ? String(e.app_user_id) : null
          if (auId && userIds.has(auId)) ids.add(String(e.id))
        }
        break
      }
      case 'group': {
        if (!t.target_value) break
        // Phase 5 training group membership — by contract, read defensively.
        try {
          const { data: members } = await db.select('ess_training_group_members', {
            company_id: companyId,
            group_id: t.target_value,
          })
          for (const m of members ?? []) {
            if (m.employee_id) ids.add(String(m.employee_id))
          }
        } catch {
          // LMS not present in this tenant/worktree — skip group targets gracefully.
        }
        break
      }
      default:
        break
    }
  }

  return Array.from(ids)
}

/**
 * Adapter that builds a RecipientDbPort from a supabase-js-style client. Each call
 * issues a `.from(table).select('*')` then chains `.eq()` for every predicate.
 * Typed loosely on purpose — the supabase builder's generics are not needed here and
 * the app-layer companyId predicate is always supplied by the caller.
 */
export function supabasePort(client: {
  from: (t: string) => { select: (c: string) => unknown }
}): RecipientDbPort {
  return {
    async select(table, eq) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = client.from(table).select('*')
      for (const [col, val] of Object.entries(eq)) {
        q = q.eq(col, val)
      }
      const res = await q
      return { data: (res?.data ?? null) as Record<string, unknown>[] | null }
    },
  }
}
