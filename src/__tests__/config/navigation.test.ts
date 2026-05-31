/**
 * @jest-environment node
 */
import { navRegistry } from '@/config/navigation'
import {
  isNavSectionVisible,
  visibleSubItems,
  type NavFilterContext,
} from '@/config/nav/filter'

const ctx = (overrides: Partial<NavFilterContext> = {}): NavFilterContext => ({
  role: 'employee',
  hasLeaveApprovalAccess: false,
  isSuperAdmin: false,
  isModuleEnabled: () => true,
  ...overrides,
})

describe('nav registry parity (pre-Phase-1 modules preserved)', () => {
  it('exposes the original core sections with the same hrefs + module gates', () => {
    const byId = new Map(navRegistry.map(s => [s.id, s]))

    expect(byId.get('dashboard')?.item.href).toBe('/dashboard')
    expect(byId.get('leave')?.moduleId).toBe('leave')
    expect(byId.get('leave')?.item.href).toBe('/dashboard/leave-applications')
    expect(byId.get('expense')?.moduleId).toBe('expense')
    expect(byId.get('timesheets')?.moduleId).toBe('timesheets')
    expect(byId.get('documents')?.moduleId).toBe('documents')
    expect(byId.get('appraisals')?.moduleId).toBe('appraisals')
    expect(byId.get('contracts')?.moduleId).toBe('contracts')
    expect(byId.get('payslips')?.item.href).toBe('/dashboard/payslips')
    expect(byId.get('profile')?.item.href).toBe('/dashboard/profile')
    expect(byId.get('settings')?.minRole).toBe('admin')
  })

  it('is sorted by order', () => {
    const orders = navRegistry.map(s => s.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })
})

describe('nav visibility filtering', () => {
  it('hides a section whose gating module is disabled', () => {
    const leave = navRegistry.find(s => s.id === 'leave')!
    expect(isNavSectionVisible(leave, ctx({ isModuleEnabled: () => false }))).toBe(false)
    expect(isNavSectionVisible(leave, ctx({ isModuleEnabled: () => true }))).toBe(true)
  })

  it('hides the admin-only Settings section from non-admins', () => {
    const settings = navRegistry.find(s => s.id === 'settings')!
    expect(isNavSectionVisible(settings, ctx({ role: 'employee' }))).toBe(false)
    expect(isNavSectionVisible(settings, ctx({ role: 'admin' }))).toBe(true)
  })

  it('hides manager-only sub-items from employees and shows them to managers', () => {
    const leave = navRegistry.find(s => s.id === 'leave')!
    const employeeSubs = visibleSubItems(leave, ctx({ role: 'employee' })).map(i => i.key)
    expect(employeeSubs).not.toContain('team-calendar')

    const managerSubs = visibleSubItems(leave, ctx({ role: 'manager' })).map(i => i.key)
    expect(managerSubs).toContain('team-calendar')
    expect(managerSubs).toContain('team-balances')
  })

  it('gates leave approval sub-items behind hasLeaveApprovalAccess', () => {
    const leave = navRegistry.find(s => s.id === 'leave')!
    const without = visibleSubItems(leave, ctx({ role: 'manager', hasLeaveApprovalAccess: false })).map(i => i.key)
    expect(without).not.toContain('pending-approvals')

    const withAccess = visibleSubItems(leave, ctx({ role: 'manager', hasLeaveApprovalAccess: true })).map(i => i.key)
    expect(withAccess).toContain('pending-approvals')
    expect(withAccess).toContain('approval-history')
  })
})
