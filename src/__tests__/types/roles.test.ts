import { hasPermission, hasMinRole, UserRole } from '@/types/roles'

describe('hasPermission', () => {
  it('admin has all permissions', () => {
    expect(hasPermission('admin', 'configure_modules')).toBe(true)
    expect(hasPermission('admin', 'manage_documents')).toBe(true)
    expect(hasPermission('admin', 'approve_leave')).toBe(true)
  })

  it('hr has hr-level permissions but not admin', () => {
    expect(hasPermission('hr', 'manage_documents')).toBe(true)
    expect(hasPermission('hr', 'view_all_employees')).toBe(true)
    expect(hasPermission('hr', 'configure_modules')).toBe(false)
    expect(hasPermission('hr', 'manage_settings')).toBe(false)
  })

  it('manager has team-level but not hr permissions', () => {
    expect(hasPermission('manager', 'approve_leave')).toBe(true)
    expect(hasPermission('manager', 'view_team_leave_calendar')).toBe(true)
    expect(hasPermission('manager', 'manage_documents')).toBe(false)
    expect(hasPermission('manager', 'manage_contracts')).toBe(false)
  })

  it('employee has no elevated permissions', () => {
    expect(hasPermission('employee', 'approve_leave')).toBe(false)
    expect(hasPermission('employee', 'manage_documents')).toBe(false)
    expect(hasPermission('employee', 'configure_modules')).toBe(false)
  })
})

describe('hasMinRole', () => {
  it('admin >= all roles', () => {
    expect(hasMinRole('admin', 'admin')).toBe(true)
    expect(hasMinRole('admin', 'hr')).toBe(true)
    expect(hasMinRole('admin', 'manager')).toBe(true)
    expect(hasMinRole('admin', 'employee')).toBe(true)
  })

  it('employee < all other roles', () => {
    expect(hasMinRole('employee', 'employee')).toBe(true)
    expect(hasMinRole('employee', 'manager')).toBe(false)
    expect(hasMinRole('employee', 'hr')).toBe(false)
    expect(hasMinRole('employee', 'admin')).toBe(false)
  })

  it('hr >= manager', () => {
    expect(hasMinRole('hr', 'manager')).toBe(true)
    expect(hasMinRole('hr', 'hr')).toBe(true)
    expect(hasMinRole('hr', 'admin')).toBe(false)
  })

  it('manager >= employee but < hr', () => {
    expect(hasMinRole('manager', 'employee')).toBe(true)
    expect(hasMinRole('manager', 'manager')).toBe(true)
    expect(hasMinRole('manager', 'hr')).toBe(false)
  })
})
