'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { roleManageLabel, USER_ROLES } from '@/types/roles';
import type { UserRole } from '@/types/roles';
import type { OnboardingStatus } from '@/lib/onboarding';
import type { PersonRow } from './people-data';

const ONBOARDING_STATUSES: OnboardingStatus[] = ['not_started', 'in_progress', 'blocked', 'completed'];

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

function authToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null;
}

function statusBadge(status: OnboardingStatus) {
  const map: Record<OnboardingStatus, string> = {
    not_started: 'bg-muted text-muted-foreground',
    in_progress: 'bg-blue-100 text-blue-800',
    blocked: 'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-800',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status.replace('_', ' ')}
    </span>
  );
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
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | 'all'>('all');

  const [editId, setEditId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('employee');
  const [editDept, setEditDept] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; email: string; password: string } | null>(null);

  const orgUnits = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) if (p.orgUnit) set.add(p.orgUnit);
    return Array.from(set).sort();
  }, [people]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (roleFilter !== 'all' && p.role !== roleFilter) return false;
      if (orgFilter !== 'all' && p.orgUnit !== orgFilter) return false;
      if (statusFilter !== 'all' && p.onboardingStatus !== statusFilter) return false;
      if (q && !`${p.name} ${p.email ?? ''}`.toLowerCase().includes(q)) return false;
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

  async function resetPassword(p: PersonRow) {
    if (!window.confirm(`Reset password for ${p.name}? A new password will be set and emailed to them.`)) return;
    setResettingId(p.id);
    try {
      const t = authToken();
      const res = await fetch(`/api/people/${p.id}/reset-password`, {
        method: 'POST',
        headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResetResult({ name: p.name, email: p.email ?? data.email ?? '', password: data.password });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setResettingId(null);
    }
  }

  const th = 'text-left font-medium text-muted-foreground px-3 py-2';
  const td = 'px-3 py-2 align-middle';

  return (
    <div>
      <div role="search" className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
          className="max-w-xs"
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')} aria-label="Filter by role" className={selectClass}>
          <option value="all">All roles</option>
          {USER_ROLES.map((r) => (<option key={r} value={r}>{roleManageLabel(r)}</option>))}
        </select>
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Filter by org unit" className={selectClass}>
          <option value="all">All org units</option>
          {orgUnits.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
        {/* Existing org units, offered as a dropdown when editing a row's dept. */}
        <datalist id="edit-dept-units">
          {orgUnits.map((o) => (<option key={o} value={o} />))}
        </datalist>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OnboardingStatus | 'all')} aria-label="Filter by onboarding status" className={selectClass}>
          <option value="all">All statuses</option>
          {ONBOARDING_STATUSES.map((s) => (<option key={s} value={s}>{s.replace('_', ' ')}</option>))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} of {people.length}</span>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Role</th>
              <th className={th}>Org unit</th>
              <th className={th}>Onboarding</th>
              <th className={th}>Active</th>
              <th className={th}>Certs</th>
              <th className={th}>Signed docs</th>
              {canManage ? <th className={th}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const editing = editId === p.id;
              return (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className={`${td} font-medium`}>
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/people/${p.id}`)}
                      className="text-primary hover:underline text-left"
                    >
                      {p.name}
                    </button>
                  </td>
                  <td className={`${td} text-muted-foreground`}>{p.email ?? '—'}</td>
                  <td className={td}>
                    {editing ? (
                      <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} aria-label={`Role for ${p.name}`} className={selectClass}>
                        {USER_ROLES.map((r) => (<option key={r} value={r}>{roleManageLabel(r)}</option>))}
                      </select>
                    ) : roleManageLabel(p.role)}
                  </td>
                  <td className={td}>
                    {editing ? (
                      <Input list="edit-dept-units" value={editDept} onChange={(e) => setEditDept(e.target.value)} aria-label={`Org unit for ${p.name}`} className="h-9 max-w-[160px]" autoComplete="off" />
                    ) : (p.orgUnit ?? '—')}
                  </td>
                  <td className={td}>{statusBadge(p.onboardingStatus)}</td>
                  <td className={td}>
                    {editing ? (
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} aria-label={`Active for ${p.name}`} />
                        Active
                      </label>
                    ) : p.isActive ? (
                      <span className="text-green-700">Active</span>
                    ) : (
                      <span className="text-muted-foreground">Inactive</span>
                    )}
                  </td>
                  <td className={td}>{p.certifications}</td>
                  <td className={td}>{p.signedDocuments}</td>
                  {canManage ? (
                    <td className={td}>
                      {editing ? (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => saveEdit(p.id)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditId(null)} disabled={busy}>Cancel</Button>
                          {rowErr ? <span role="alert" className="text-xs text-destructive">{rowErr}</span> : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(p)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => resetPassword(p)} disabled={resettingId === p.id}>
                            {resettingId === p.id ? 'Resetting…' : 'Reset password'}
                          </Button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td className={`${td} text-center text-muted-foreground`} colSpan={canManage ? 9 : 8}>
                  No people match the filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* New-password modal (bg-white — not bg-background, which is a gradient
          and renders transparent). */}
      {resetResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setResetResult(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground">Password reset — {resetResult.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A new password has been set{resetResult.email ? <> and emailed to <strong>{resetResult.email}</strong></> : ''}. Share it securely:
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/30 p-3">
              <code className="flex-1 break-all text-sm text-foreground">{resetResult.password}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { navigator.clipboard?.writeText(resetResult.password).then(() => toast.success('Copied')).catch(() => {}); }}
              >
                Copy
              </Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setResetResult(null)}>Done</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
