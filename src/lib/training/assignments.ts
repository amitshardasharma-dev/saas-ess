// src/lib/training/assignments.ts
//
// Assignment engine: resolve a module's assignment rows into the concrete set
// of employees who must complete it. Tenant-scoped via the module's company_id.
//
// PUBLISHED CONTRACT: resolveAssignees(moduleId) — re-exported from @/lib/training.

import { supabaseAdmin } from '@/lib/supabase-admin'
import type { TrainingAssignment, Assignee } from '@/types/training'

// Assignee now lives in @/types/training (types-only module) so client code can
// import it without dragging this server-only module (and supabaseAdmin) into the
// browser bundle. Re-exported here to preserve the existing import path.
export type { Assignee }

/**
 * Employee ids whose onboarding checklist has a training step for this module
 * (MOS-858). Adding a course to an onboarding flow assigns it to everyone who
 * gets that step, so it shows in their learning view without a separate rule.
 */
async function onboardingLearnerIds(companyId: string, moduleId: string): Promise<string[]> {
  // The flow's own template steps live in the same table with no employee_id;
  // only per-person steps count.
  const { data } = await supabaseAdmin
    .from('ess_onboarding_steps')
    .select('employee_id')
    .eq('company_id', companyId)
    .eq('step_type', 'training')
    .eq('ref_id', moduleId)
    .not('employee_id', 'is', null)
  return Array.from(new Set((data ?? []).map((s) => s.employee_id as string | null).filter((id): id is string => !!id)))
}

/**
 * Resolve every employee assigned a module, de-duplicated, tenant-scoped.
 *
 * Supports all four target types:
 *   - 'role'     -> employees whose app_user.role === target_value
 *   - 'org_unit' -> employees whose department === target_value
 *   - 'group'    -> members of the custom group target_value
 *   - 'user'     -> the single employee target_value
 * plus everyone with a training step for the module in their onboarding.
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

  // 2. Load all assignment rows and onboarding learners for this module (tenant-scoped).
  const [{ data: assignmentRows }, onboardingIds] = await Promise.all([
    supabaseAdmin
      .from('ess_training_assignments')
      .select('*')
      .eq('module_id', moduleId)
      .eq('company_id', companyId),
    onboardingLearnerIds(companyId, moduleId),
  ])

  const assignments = (assignmentRows ?? []) as TrainingAssignment[]
  if (assignments.length === 0 && onboardingIds.length === 0) return []

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

  // 3d. user -> direct employee ids, and 3e. onboarding -> people with a
  // training step for this module.
  const directIds = Array.from(new Set([...userIds, ...onboardingIds]))
  if (directIds.length > 0) {
    const { data: emps } = await supabaseAdmin
      .from('ess_employees')
      .select('id, full_name, department')
      .eq('company_id', companyId)
      .in('id', directIds)
    for (const e of emps ?? []) add(e as Assignee & { id: string })
  }

  return Array.from(result.values())
}

/** How many people get a module through their onboarding checklist. */
export async function onboardingLearnerCount(companyId: string, moduleId: string): Promise<number> {
  return (await onboardingLearnerIds(companyId, moduleId)).length
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

  const ids = (modules ?? []).map((m) => m.id as string)
  const assigned = await Promise.all(ids.map((id) => isAssigned(employeeId, id)))
  return ids.filter((_, i) => assigned[i])
}
