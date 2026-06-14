/**
 * @jest-environment node
 */
import { roleDisplayLabel } from '@/types/roles';

describe('RBAC relabel (display names only)', () => {
  it('relabels roles to charity language', () => {
    // super-admin label comes from the isSuperAdmin flag, not a role string
    expect(roleDisplayLabel('admin', true)).toBe('Super Admin');
    expect(roleDisplayLabel('admin')).toBe('Admin');
    expect(roleDisplayLabel('hr')).toBe('Staff');
    expect(roleDisplayLabel('manager')).toBe('Staff');
    expect(roleDisplayLabel('employee')).toBe('Volunteer');
  });
});
