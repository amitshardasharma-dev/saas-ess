// src/types/roles.ts

export const USER_ROLES = ['admin', 'hr', 'manager', 'employee'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const MODULE_IDS = [
  'leave',
  'expense',
  'timesheets',
  'documents',
  'appraisals',
  'contracts',
  'team_calendar',
] as const
export type ModuleId = (typeof MODULE_IDS)[number]

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
