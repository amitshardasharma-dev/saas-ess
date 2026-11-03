// The `staff` role — paid staff with volunteer-level access.
import { USER_ROLES, ROLE_DISPLAY, hasMinRole, hasPermission, roleManageLabel } from '@/types/roles'
import { tierMatchesRole } from '@/types/compliance-register'
import { ALL_DOCUMENT_ROLES, documentVisibleTo } from '@/types/document'

describe('staff role', () => {
  it('is offered in role pickers, between Manager and Volunteer', () => {
    expect(USER_ROLES).toEqual(['admin', 'hr', 'manager', 'staff', 'employee'])
    expect(roleManageLabel('staff')).toBe('Staff')
    expect(ROLE_DISPLAY.staff).toBe('Staff')
  })

  it('has volunteer-level access and no manager powers', () => {
    expect(hasMinRole('staff', 'employee')).toBe(true)
    expect(hasMinRole('staff', 'manager')).toBe(false)
    expect(hasMinRole('manager', 'staff')).toBe(true)
    expect(hasMinRole('employee', 'staff')).toBe(false)
    expect(hasPermission('staff', 'approve_leave')).toBe(false)
    expect(hasPermission('staff', 'manage_documents')).toBe(false)
  })

  it('belongs to the staff compliance tier, not the volunteer tier', () => {
    expect(tierMatchesRole('staff', 'staff')).toBe(true)
    expect(tierMatchesRole('volunteer', 'staff')).toBe(false)
    expect(tierMatchesRole('all', 'staff')).toBe(true)
    expect(tierMatchesRole('staff', 'manager')).toBe(true)
    expect(tierMatchesRole('staff', 'employee')).toBe(false)
  })
})

describe('documentVisibleTo', () => {
  it('opens a document with no access list to every role', () => {
    for (const r of USER_ROLES) expect(documentVisibleTo(null, r)).toBe(true)
    expect(ALL_DOCUMENT_ROLES).toContain('staff')
  })

  it('lets staff see documents saved before the role existed', () => {
    // "All staff & volunteers" and "Staff only" as saved before the staff role existed.
    expect(documentVisibleTo(['employee', 'manager', 'hr', 'admin'], 'staff')).toBe(true)
    expect(documentVisibleTo(['manager', 'hr', 'admin'], 'staff')).toBe(true)
  })

  it('keeps HR-only and admin-only documents away from staff and volunteers', () => {
    expect(documentVisibleTo(['hr', 'admin'], 'staff')).toBe(false)
    expect(documentVisibleTo(['admin'], 'staff')).toBe(false)
    expect(documentVisibleTo(['staff', 'manager', 'hr', 'admin'], 'employee')).toBe(false)
  })
})
