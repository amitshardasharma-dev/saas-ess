// src/lib/training/access.ts
//
// Who may take a module: the same set the learning view lists
// (/api/training/assigned) — assignment rules, onboarding steps (both via
// resolveAssignees) and compliance requirements for the person's tier/group.
// The tracking and quiz-result routes gate on this so every module a learner
// can see, they can also complete.

import { isAssigned } from './assignments'
import { requiredModuleIdsForEmployee } from '@/lib/compliance/register'
import type { UserRole } from '@/types/roles'

export async function canTakeModule(
  companyId: string,
  employeeId: string,
  role: UserRole,
  moduleId: string
): Promise<boolean> {
  if (await isAssigned(employeeId, moduleId)) return true
  const required = await requiredModuleIdsForEmployee(companyId, employeeId, role)
  return required.includes(moduleId)
}
