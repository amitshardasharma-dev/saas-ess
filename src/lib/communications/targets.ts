// src/lib/communications/targets.ts
//
// Phase 7 — client-safe metadata for the five audience target types. Lives in lib
// (not a component/route) so both the compose targeting control and the console can
// label/describe a target without re-deriving the mapping, and without importing a
// React component into a route module.
//
// The wire contract (target_type values) is owned by @/types/communications
// (composeMessageSchema / targetSchema). This module only adds presentation +
// option-loading helpers; it never changes what the server accepts.

import { Users, Shield, Building2, UsersRound, User } from 'lucide-react'
import type { MessageTargetType } from '@/types/communications'
import { USER_ROLES, roleManageLabel, type UserRole } from '@/types/roles'

export type AudienceType = MessageTargetType // 'all' | 'role' | 'org_unit' | 'group' | 'user'

export interface AudienceMeta {
  type: AudienceType
  /** Short label for selectors / chips. */
  label: string
  /** One-line helper shown under the picker. */
  hint: string
  /** Whether this type needs a `target_value`. 'all' does not. */
  needsValue: boolean
  icon: React.ComponentType<{ className?: string }>
}

/** Ordered for display (broadest → narrowest). */
export const AUDIENCE_TYPES: AudienceMeta[] = [
  { type: 'all', label: 'Everyone', hint: 'Every active member of your organisation.', needsValue: false, icon: Users },
  { type: 'role', label: 'By role', hint: 'Members with a specific access level.', needsValue: true, icon: Shield },
  { type: 'org_unit', label: 'By department', hint: 'Members in a program or department.', needsValue: true, icon: Building2 },
  { type: 'group', label: 'By group', hint: 'Members of a saved group.', needsValue: true, icon: UsersRound },
  { type: 'user', label: 'A single person', hint: 'Send privately to one person.', needsValue: true, icon: User },
]

export function audienceMeta(type: AudienceType): AudienceMeta {
  return AUDIENCE_TYPES.find((a) => a.type === type) ?? AUDIENCE_TYPES[0]
}

/** Roles offered in the role picker, with their management labels (HR vs Manager kept distinct). */
export const ROLE_OPTIONS: { value: UserRole; label: string }[] = USER_ROLES.map((r) => ({
  value: r,
  label: roleManageLabel(r),
}))

/**
 * Human label for a persisted target (type + value), used by the console to render
 * what a sent message was addressed to. `value` resolvers are passed in so this stays
 * pure (no data fetching): callers supply name lookups they already hold.
 */
export function describeTarget(
  type: AudienceType,
  value: string | null | undefined,
  resolvers?: {
    role?: (v: string) => string
    department?: (v: string) => string
    group?: (v: string) => string
    user?: (v: string) => string
  },
): string {
  switch (type) {
    case 'all':
      return 'Everyone'
    case 'role':
      return value ? `Role: ${resolvers?.role?.(value) ?? roleManageLabel(value as UserRole)}` : 'Role'
    case 'org_unit':
      return value ? `Department: ${resolvers?.department?.(value) ?? value}` : 'Department'
    case 'group':
      return value ? `Group: ${resolvers?.group?.(value) ?? value}` : 'Group'
    case 'user':
      return value ? `Person: ${resolvers?.user?.(value) ?? value}` : 'A single person'
    default:
      return 'Recipients'
  }
}
