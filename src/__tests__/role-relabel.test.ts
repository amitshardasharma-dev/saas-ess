/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { roleDisplayLabel } from '@/types/roles';

describe('RBAC relabel (display names only)', () => {
  it('relabels roles to charity language', () => {
    expect(roleDisplayLabel('super_admin')).toBe('Super Admin');
    expect(roleDisplayLabel('admin')).toBe('Admin');
    expect(roleDisplayLabel('hr')).toBe('Staff');
    expect(roleDisplayLabel('manager')).toBe('Staff');
    expect(roleDisplayLabel('employee')).toBe('Volunteer');
  });
});
