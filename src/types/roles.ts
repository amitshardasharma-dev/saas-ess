// src/types/roles.ts

export const USER_ROLES = ['admin', 'hr', 'manager', 'employee'] as const
export type UserRole = (typeof USER_ROLES)[number]

/**
 * Stable module ids for ALL phases (1-7).
 *
 * Phase 1 declares every module id up front so later phases never edit this
 * coordination file (prevents merge conflicts across parallel phase worktrees).
 * A module is only usable for a tenant when listed in that tenant's
 * `ess_companies.settings.modules_enabled`. NEVER remove or rename an id.
 */
export const MODULE_IDS = [
  // existing (pre-Phase 1)
  'leave',
  'expense',
  'timesheets',
  'documents',
  'appraisals',
  'contracts',
  'team_calendar',
  // Phase 2-7 additions (Birch Foundation)
  'profiles', // Phase 2
  'documents_esign', // Phase 4
  'communications', // Phase 7
  'training', // Phase 5
  'quizzes', // Phase 6
  'training_tracking', // Phase 5
  'reporting', // Phase 7
  'compliance', // Phase 3
  'expiry_reminders', // Phase 7
  'recertification', // Phase 7
] as const
export type ModuleId = (typeof MODULE_IDS)[number]

/**
 * Module dependency graph.
 *
 * A module may only be ENABLED when every id it depends on is already enabled,
 * and may not be DISABLED while another enabled module depends on it.
 * Enforced by `@/lib/modules` (assertModuleEnabled / assertToggleAllowed),
 * `/api/modules`, and the platform tenant config route.
 */
export const MODULE_DEPENDENCIES: Partial<Record<ModuleId, ModuleId[]>> = {
  recertification: ['training', 'compliance'],
  quizzes: ['training'],
  training_tracking: ['training'],
  expiry_reminders: ['compliance'],
}

// Which roles can access which features
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 40,
  hr: 30,
  manager: 20,
  employee: 10,
}

// Minimum role level required for each permission
export const PERMISSIONS = {
  // Module management
  configure_modules: 'admin',

  // Team views
  view_team_leave_calendar: 'manager',
  view_team_leave_balances: 'manager',
  view_team_timesheets: 'manager',
  approve_timesheets: 'manager',
  approve_leave: 'manager',
  approve_expenses: 'manager',

  // HR-level views
  view_all_employees: 'hr',
  manage_documents: 'hr',
  manage_contracts: 'hr',
  manage_appraisal_cycles: 'hr',
  view_acknowledgment_reports: 'hr',

  // Admin
  manage_settings: 'admin',
  manage_users: 'admin',
} as const satisfies Record<string, UserRole>

export type Permission = keyof typeof PERMISSIONS

/**
 * Check if a role has a specific permission.
 * Higher roles inherit all lower-role permissions.
 */
export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  const requiredRole = PERMISSIONS[permission]
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

/**
 * Check if a role meets a minimum role level.
 */
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole]
}

/**
 * CONFIRMED role display mapping (client decision — see _SHARED_CONVENTIONS §3).
 *
 * Underlying role VALUES never change (data stays stable). These are only the
 * Birch-facing display labels. `hr` and `manager` both collapse to "Staff";
 * permission logic still distinguishes them internally via hasMinRole.
 *
 *   admin       -> Admin
 *   hr          -> Staff
 *   manager     -> Staff
 *   employee    -> Volunteer
 *   super_admin -> Super Admin   (the is_super_admin flag, not a UserRole)
 *
 * `super_admin` is keyed separately because it is a boolean flag on the user,
 * not a member of UserRole.
 */
export const ROLE_DISPLAY: Record<UserRole | 'super_admin', string> = {
  admin: 'Admin',
  hr: 'Staff',
  manager: 'Staff',
  employee: 'Volunteer',
  super_admin: 'Super Admin',
}

/**
 * Resolve the display label for a user given their role + super-admin flag.
 */
export function roleDisplayLabel(role: UserRole, isSuperAdmin = false): string {
  return isSuperAdmin ? ROLE_DISPLAY.super_admin : ROLE_DISPLAY[role]
}
