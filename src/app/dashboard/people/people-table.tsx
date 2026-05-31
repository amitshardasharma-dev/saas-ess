'use client';

import { useMemo, useState } from 'react';
import { roleDisplayLabel, USER_ROLES } from '@/types/roles';
import type { UserRole } from '@/types/roles';
import type { OnboardingStatus } from '@/lib/onboarding';
import type { PersonRow } from './people-data';

const ONBOARDING_STATUSES: OnboardingStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'completed',
];

export function PeopleTable({ people }: { people: PersonRow[] }) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | 'all'>('all');

  const orgUnits = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) {
      if (p.orgUnit) {
        set.add(p.orgUnit);
      }
    }
    return Array.from(set).sort();
  }, [people]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (roleFilter !== 'all' && p.role !== roleFilter) {
        return false;
      }
      if (orgFilter !== 'all' && p.orgUnit !== orgFilter) {
        return false;
      }
      if (statusFilter !== 'all' && p.onboardingStatus !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = `${p.name} ${p.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [people, query, roleFilter, orgFilter, statusFilter]);

  return (
    <div>
      <div role="search">
        <input
          type="search"
          placeholder="Search name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
          aria-label="Filter by role"
        >
          <option value="all">All roles</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleDisplayLabel(r)}
            </option>
          ))}
        </select>
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          aria-label="Filter by org unit"
        >
          <option value="all">All org units</option>
          {orgUnits.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OnboardingStatus | 'all')}
          aria-label="Filter by onboarding status"
        >
          <option value="all">All statuses</option>
          {ONBOARDING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Org unit</th>
            <th>Onboarding</th>
            <th>Certifications</th>
            <th>Signed docs</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.email ?? '—'}</td>
              <td>{roleDisplayLabel(p.role)}</td>
              <td>{p.orgUnit ?? '—'}</td>
              <td>{p.onboardingStatus}</td>
              <td>{p.certifications}</td>
              <td>{p.signedDocuments}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7}>No people match the filters.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
