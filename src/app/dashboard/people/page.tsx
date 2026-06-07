'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { USER_ROLES, roleDisplayLabel, type UserRole } from '@/types/roles';
import { PeopleTable } from './people-table';
import type { PersonRow } from './people-data';

function authToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null;
}

// Admin "People" dashboard. Read for managers+/staff; create + manage for admins.
export default function PeoplePage() {
  const { user } = useAuthStore();
  const canManage = !!(user && (user.is_super_admin === true || (user.role || '') === 'admin'));

  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = authToken();
      const res = await fetch('/api/people', {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
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
    <div>
      <h1>People</h1>
      {canManage ? <AddPersonForm onCreated={reload} /> : null}
      {loading ? <p>Loading…</p> : null}
      {error ? <p role="alert">Could not load people: {error}</p> : null}
      {!loading && !error ? (
        <PeopleTable people={people} canManage={canManage} onChanged={reload} />
      ) : null}
    </div>
  );
}

function AddPersonForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const t = authToken();
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ full_name: fullName, email, role, department }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMsg(
        data.temp_password
          ? `Created “${fullName}”. Temporary password: ${data.temp_password}`
          : `Created “${fullName}”.`
      );
      setFullName('');
      setEmail('');
      setDepartment('');
      setRole('employee');
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'failed to create');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ margin: '12px 0' }}>
        <button onClick={() => { setOpen(true); setMsg(null); setErr(null); }}>+ Add person</button>
        {msg ? <p role="status" style={{ color: 'green' }}>{msg}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ margin: '12px 0', display: 'grid', gap: 8, maxWidth: 420 }}>
      <label>
        Full name
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} required aria-label="Full name" />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email" />
      </label>
      <label>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} aria-label="Role">
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>{roleDisplayLabel(r)}</option>
          ))}
        </select>
      </label>
      <label>
        Org unit / department
        <input value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department" />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create person'}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
      {err ? <p role="alert" style={{ color: 'crimson' }}>{err}</p> : null}
    </form>
  );
}
