'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth';
import { USER_ROLES, roleDisplayLabel, type UserRole } from '@/types/roles';
import { PeopleTable } from './people-table';
import type { PersonRow } from './people-data';

function authToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null;
}

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

// Admin "People" dashboard. Read for managers+/staff; create + manage for admins.
export default function PeoplePage() {
  const { user } = useAuthStore();
  const canManage = !!(user && (user.is_super_admin === true || (user.role || '') === 'admin'));

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = authToken();
      const res = await fetch('/api/people', { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { people: PersonRow[] };
      setPeople(data.people ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">People</h1>
            <p className="text-sm text-muted-foreground">
              Manage volunteer &amp; staff profiles, onboarding status and documents
            </p>
          </div>
          {canManage ? (
            <Button onClick={() => { setShowAdd((v) => !v); setNotice(null); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add person
            </Button>
          ) : null}
        </div>

        {notice ? (
          <div className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
            {notice}
          </div>
        ) : null}

        {canManage && showAdd ? (
          <AddPersonForm
            onClose={() => setShowAdd(false)}
            onCreated={(m) => { setNotice(m); setShowAdd(false); reload(); }}
          />
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">Could not load people: {error}</p> : null}
        {!loading && !error ? <PeopleTable people={people} canManage={canManage} onChanged={reload} /> : null}
      </div>
    </DashboardLayout>
  );
}

function AddPersonForm({ onClose, onCreated }: { onClose: () => void; onCreated: (notice: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const t = authToken();
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ full_name: fullName, email, role, department }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onCreated(
        data.temp_password
          ? `Created “${fullName}”. Temporary password: ${data.temp_password}`
          : `Created “${fullName}”.`
      );
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'failed to create');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 rounded-lg border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold mb-3">Add a new person</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="np-name">Full name</label>
          <Input id="np-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="np-email">Email</label>
          <Input id="np-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="np-role">Role</label>
          <select id="np-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{roleDisplayLabel(r)}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="np-dept">Org unit / department</label>
          <Input id="np-dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
      </div>
      {err ? <p role="alert" className="mt-3 text-sm text-destructive">{err}</p> : null}
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create person'}</Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}
