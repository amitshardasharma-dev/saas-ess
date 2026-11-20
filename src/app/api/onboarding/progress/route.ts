// GET /api/onboarding/progress — onboarding progress for every person in the
// company (manager+): their volunteer types, status, "4 of 6" counts, the open
// steps and the approval. Feeds /dashboard/onboarding/progress.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fetchAll } from '@/lib/onboarding'
import { listVolunteerTypes } from '@/lib/volunteer-types'
import type { OnboardingStatus, ProgressRow } from '@/types/onboarding'
import type { UserRole } from '@/types/roles'

export const GET = withAuth(
  async (_req: NextRequest, { companyId }) => {
    const db = supabaseAdmin
    const [employees, appUsers, states, steps, memberships, types] = await Promise.all([
      fetchAll<{ id: string; full_name: string | null; email: string | null; app_user_id: string | null }>((f, t) =>
        db.from('ess_employees').select('id, full_name, email, app_user_id').eq('company_id', companyId).order('id').range(f, t),
      ),
      fetchAll<{ id: string; role: UserRole; is_active: boolean }>((f, t) =>
        db.from('ess_app_users').select('id, role, is_active').eq('company_id', companyId).order('id').range(f, t),
      ),
      fetchAll<{ employee_id: string; status: OnboardingStatus; approved_at: string | null; approved_by: string | null }>((f, t) =>
        db.from('ess_onboarding_states').select('employee_id, status, approved_at, approved_by').eq('company_id', companyId).order('employee_id').range(f, t),
      ),
      fetchAll<{ id: string; employee_id: string; title: string; status: string; is_required: boolean; step_type: string; sort_order: number }>((f, t) =>
        db
          .from('ess_onboarding_steps')
          .select('id, employee_id, title, status, is_required, step_type, sort_order')
          .eq('company_id', companyId)
          .not('employee_id', 'is', null)
          .order('id')
          .range(f, t),
      ),
      fetchAll<{ employee_id: string; volunteer_type_id: string }>((f, t) =>
        db
          .from('ess_employee_volunteer_types')
          .select('employee_id, volunteer_type_id')
          .eq('company_id', companyId)
          .order('employee_id')
          .order('volunteer_type_id')
          .range(f, t),
      ),
      listVolunteerTypes(companyId),
    ])

    const userById = new Map(appUsers.map((u) => [u.id, u]))
    const nameByAppUser = new Map<string, string>()
    for (const e of employees) if (e.app_user_id) nameByAppUser.set(e.app_user_id, e.full_name ?? '')
    const stateByEmp = new Map(states.map((s) => [s.employee_id, s]))
    const stepsByEmp = new Map<string, typeof steps>()
    for (const s of steps) {
      if (!stepsByEmp.has(s.employee_id)) stepsByEmp.set(s.employee_id, [])
      stepsByEmp.get(s.employee_id)!.push(s)
    }
    const typesByEmp = new Map<string, string[]>()
    for (const m of memberships) {
      if (!typesByEmp.has(m.employee_id)) typesByEmp.set(m.employee_id, [])
      typesByEmp.get(m.employee_id)!.push(m.volunteer_type_id)
    }
    const resolved = (s: string) => s === 'done' || s === 'skipped'

    const rows: ProgressRow[] = employees.map((e) => {
      const u = e.app_user_id ? userById.get(e.app_user_id) : undefined
      const mine = (stepsByEmp.get(e.id) ?? []).sort((a, b) => a.sort_order - b.sort_order)
      const required = mine.filter((s) => s.is_required !== false)
      const st = stateByEmp.get(e.id)
      return {
        employeeId: e.id,
        name: e.full_name ?? '(unnamed)',
        email: e.email ?? null,
        role: u?.role ?? 'employee',
        isActive: u?.is_active ?? true,
        typeIds: typesByEmp.get(e.id) ?? [],
        status: st?.status ?? 'not_started',
        total: mine.length,
        resolved: mine.filter((s) => resolved(s.status)).length,
        requiredTotal: required.length,
        requiredResolved: required.filter((s) => resolved(s.status)).length,
        openSteps: mine
          .filter((s) => !resolved(s.status))
          .map((s) => ({ id: s.id, title: s.title, isRequired: s.is_required !== false, stepType: s.step_type })),
        approvedAt: st?.approved_at ?? null,
        approvedBy: st?.approved_by ? nameByAppUser.get(st.approved_by) ?? null : null,
      }
    })
    rows.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      people: rows,
      types: types.map((t) => ({ id: t.id, name: t.name, memberCount: t.memberCount })),
    })
  },
  { minRole: 'manager' },
)
