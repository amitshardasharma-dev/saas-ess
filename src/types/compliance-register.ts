// Compliance Document Register types — the admin-defined requirement list
// (certificates + trainings) and the per-person resolution helpers.
import { z } from 'zod'
import type { UserRole } from '@/types/roles'

export type RequirementKind = 'certification' | 'training'
export type RequirementTargetType = 'tier' | 'group'
export type ComplianceTier = 'volunteer' | 'staff' | 'all'

export interface ComplianceRequirement {
  id: string
  company_id: string
  kind: RequirementKind
  ref_id: string
  target_type: RequirementTargetType
  target_value: string
  created_by: string | null
  created_at: string
}

/** A requirement enriched with the referenced item's display name (for lists). */
export interface ComplianceRequirementView extends ComplianceRequirement {
  ref_name: string | null
}

export const requirementCreateSchema = z
  .object({
    kind: z.enum(['certification', 'training']),
    ref_id: z.string().uuid(),
    target_type: z.enum(['tier', 'group']),
    target_value: z.string().min(1),
  })
  .strict()
  .refine(
    (v) => v.target_type !== 'tier' || ['volunteer', 'staff', 'all'].includes(v.target_value),
    { message: 'tier target_value must be volunteer | staff | all', path: ['target_value'] },
  )

export type RequirementCreateInput = z.infer<typeof requirementCreateSchema>

/** Display tiers map to underlying roles: volunteer=employee, staff=hr|manager. */
export function tierMatchesRole(tier: string, role: UserRole): boolean {
  if (tier === 'all') return true
  if (tier === 'volunteer') return role === 'employee'
  if (tier === 'staff') return role === 'hr' || role === 'manager'
  return false
}

/** Does a requirement apply to a person with this role + group memberships? */
export function requirementApplies(
  req: Pick<ComplianceRequirement, 'target_type' | 'target_value'>,
  role: UserRole,
  groupIds: string[],
): boolean {
  if (req.target_type === 'tier') return tierMatchesRole(req.target_value, role)
  if (req.target_type === 'group') return groupIds.includes(req.target_value)
  return false
}
