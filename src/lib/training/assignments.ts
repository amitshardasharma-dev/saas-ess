// src/lib/training/assignments.ts
//
// Assignment engine: resolve a module's assignment rows into the concrete set
// of employees who must complete it. Tenant-scoped via the module's company_id.
//
// PUBLISHED CONTRACT: resolveAssignees(moduleId) — re-exported from @/lib/training.

import { supabaseAdmin } from '@/lib/supabase-server'
import type { TrainingAssignment } from '@/types/training'

/** A resolved assignee (the minimal shape callers need). */
export interface Assignee {
  employee_id: string
  full_name: string | null
  department: string | null
}

/**
 * Resolve every employee assigned a module, de-duplicated, tenant-scoped.
 *
 * Supports all four target types:
 *   - 'role'     -> employees whose app_user.role === target_value
 *   - 'org_unit' -> employees whose department === target_value
 *   - 'group'    -> members of the custom group target_value
 *   - 'user'     -> the single employee target_value
 *
 * Returns [] for an unknown/foreign module (no rows -> nothing leaks).
 */
export async function resolveAssignees(moduleId: string): Promise<Assignee[]> {
  // 1. Load the module to obtain its tenant (and confirm it exists).
  const { data: mod } = await supabaseAdmin
    .from('ess_training_modules')
    .select('id, company_id')
    .eq('id', moduleId)
    .single()

  if (!mod) return []
  const companyId = mod.company_id as string

  // 2. Load all assignment rows for this module (tenant-scoped).
  const { data: assignmentRows } = await supabaseAdmin
    .from('ess_training_assignments')
    .select('*')
    .eq('module_id', moduleId)
    .eq('company_id', companyId)

  const assignments = (assignmentRows ?? []) as TrainingAssignment[]
  if (assignments.length === 0) return []

  const byType = (t: TrainingAssignment['target_type']) =>
    assignments.filter((a) => a.target_type === t).map((a) => a.target_value)

  const roleValues = byType('role')
  const orgUnitValues = byType('org_unit')
  const groupIds = byType('group')
  const userIds = byType('user')

  const result = new Map<string, Assignee>()
  const add = (e: { id: string; full_name: string | null; department: string | null }) =>
    result.set(e.id, { employee_id: e.id, full_name: e.full_name, department: e.department })

  // 3a. role -> employees joined through their app_user role.
  if (roleValues.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('ess_app_users')
      .select('id')
      .eq('company_id', companyId)
      .in('role', roleValues)
    const appUserIds = (users ?? []).map((u) => u.id as string)
    if (appUserIds.length > 0) {
      const { data: emps } = await supabaseAdmin
        .from('ess_employees')
        .select('id, full_name, department')
        .eq('company_id', companyId)
        .in('app_user_id', appUserIds)
      for (const e of emps ?? []) add(e as Assignee & { id: string })
    }
  }

  // 3b. org_unit -> employees by department.
  if (orgUnitValues.length > 0) {
    const { data: emps } = await supabaseAdmin
      .from('ess_employees')
      .select('id, full_name, department')
      .eq('company_id', companyId)
      .in('department', orgUnitValues)
    for (const e of emps ?? []) add(e as Assignee & { id: string })
  }

  // 3c. group -> explicit group members.
  if (groupIds.length > 0) {
    const { data: members } = await supabaseAdmin
      .from('ess_training_group_members')
      .select('employee_id')
      .eq('company_id', companyId)
      .in('group_id', groupIds)
    const memberIds = Array.from(new Set((members ?? []).map((m) => m.employee_id as string)))
    if (memberIds.length > 0) {
      const { data: emps } = await supabaseAdmin
        .from('ess_employees')
        .select('id, full_name, department')
        .eq('company_id', companyId)
        .in('id', memberIds)
      for (const e of emps ?? []) add(e as Assignee & { id: string })
    }
  }

  // 3d. user -> direct employee ids.
  if (userIds.length > 0) {
    const { data: emps } = await supabaseAdmin
      .from('ess_employees')
      .select('id, full_name, department')
      .eq('company_id', companyId)
      .in('id', userIds)
    for (const e of emps ?? []) add(e as Assignee & { id: string })
  }

  return Array.from(result.values())
}

/**
 * Whether a specific employee is assigned a module (used to gate the learning
 * view and tracking writes). Tenant-scoped via resolveAssignees.
 */
export async function isAssigned(employeeId: string, moduleId: string): Promise<boolean> {
  const assignees = await resolveAssignees(moduleId)
  return assignees.some((a) => a.employee_id === employeeId)
}

/**
 * The published module ids a given employee is assigned (deduped). Resolves
 * each published module's assignees and keeps those that include the employee.
 */
export async function assignedModuleIdsForEmployee(
  companyId: string,
  employeeId: string
): Promise<string[]> {
  const { data: modules } = await supabaseAdmin
    .from('ess_training_modules')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'published')

  const ids: string[] = []
  for (const m of modules ?? []) {
    if (await isAssigned(employeeId, m.id as string)) ids.push(m.id as string)
  }
  return ids
}
