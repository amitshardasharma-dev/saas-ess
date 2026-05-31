import { ROLE_DISPLAY, roleDisplayLabel } from '@/types/roles'

describe('role display mapping (Birch confirmed decision)', () => {
  it('maps each role to its confirmed display label', () => {
    expect(ROLE_DISPLAY.admin).toBe('Admin')
    expect(ROLE_DISPLAY.hr).toBe('Staff')
    expect(ROLE_DISPLAY.manager).toBe('Staff')
    expect(ROLE_DISPLAY.employee).toBe('Volunteer')
    expect(ROLE_DISPLAY.super_admin).toBe('Super Admin')
  })

  it('roleDisplayLabel returns Super Admin when the flag is set', () => {
    expect(roleDisplayLabel('admin', true)).toBe('Super Admin')
    expect(roleDisplayLabel('admin', false)).toBe('Admin')
    expect(roleDisplayLabel('employee')).toBe('Volunteer')
  })
})
