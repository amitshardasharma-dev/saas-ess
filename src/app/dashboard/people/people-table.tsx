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

function authToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null;
}

export function PeopleTable({
  people,
  canManage = false,
  onChanged,
}: {
  people: PersonRow[];
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | 'all'>('all');

  // Inline edit state.
  const [editId, setEditId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('employee');
  const [editDept, setEditDept] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowErr, setRowErr] = useState<string | null>(null);

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
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      if (orgFilter !== 'all' && p.orgUnit !== orgFilter) return false;
      if (statusFilter !== 'all' && p.onboardingStatus !== statusFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.email ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [people, query, roleFilter, orgFilter, statusFilter]);

  function startEdit(p: PersonRow) {
    setEditId(p.id);
    setEditRole(p.role);
    setEditDept(p.orgUnit ?? '');
    setEditActive(p.isActive);
    setRowErr(null);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setRowErr(null);
    try {
      const t = authToken();
      const res = await fetch(`/api/people/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ role: editRole, department: editDept, is_active: editActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEditId(null);
      onChanged?.();
    } catch (e) {
      setRowErr(e instanceof Error ? e.message : 'failed to save');
    } finally {
      setBusy(false);
    }
  }

  const colCount = canManage ? 9 : 8;

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
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')} aria-label="Filter by role">
          <option value="all">All roles</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>{roleDisplayLabel(r)}</option>
          ))}
        </select>
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Filter by org unit">
          <option value="all">All org units</option>
          {orgUnits.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OnboardingStatus | 'all')} aria-label="Filter by onboarding status">
          <option value="all">All statuses</option>
          {ONBOARDING_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
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
            <th>Active</th>
            <th>Certifications</th>
            <th>Signed docs</th>
            {canManage ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => {
            const editing = editId === p.id;
            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.email ?? '—'}</td>
                <td>
                  {editing ? (
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} aria-label={`Role for ${p.name}`}>
                      {USER_ROLES.map((r) => (
                        <option key={r} value={r}>{roleDisplayLabel(r)}</option>
                      ))}
                    </select>
                  ) : (
                    roleDisplayLabel(p.role)
                  )}
                </td>
                <td>
                  {editing ? (
                    <input value={editDept} onChange={(e) => setEditDept(e.target.value)} aria-label={`Org unit for ${p.name}`} />
                  ) : (
                    p.orgUnit ?? '—'
                  )}
                </td>
                <td>{p.onboardingStatus}</td>
                <td>
                  {editing ? (
                    <label>
                      <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} aria-label={`Active for ${p.name}`} />
                      Active
                    </label>
                  ) : p.isActive ? (
                    'Active'
                  ) : (
                    'Inactive'
                  )}
                </td>
                <td>{p.certifications}</td>
                <td>{p.signedDocuments}</td>
                {canManage ? (
                  <td>
                    {editing ? (
                      <>
                        <button onClick={() => saveEdit(p.id)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                        <button onClick={() => setEditId(null)} disabled={busy}>Cancel</button>
                        {rowErr ? <span role="alert" style={{ color: 'crimson' }}> {rowErr}</span> : null}
                      </>
                    ) : (
                      <button onClick={() => startEdit(p)}>Edit</button>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={colCount}>No people match the filters.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
