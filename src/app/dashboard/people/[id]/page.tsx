'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Circle, Mail, Phone, Hash, Building2, CalendarDays } from 'lucide-react';
import { roleManageLabel, type UserRole } from '@/types/roles';

function authToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null;
}

interface PersonDetail {
  id: string; name: string; email: string | null; phone: string | null; employeeNo: string | null;
  department: string | null; designation: string | null; status: string | null; dateOfJoining: string | null;
  role: UserRole; isActive: boolean;
  onboarding: { status: string; completedAt: string | null; steps: { id: string; title: string; description: string | null; status: string; sortOrder: number; completedAt: string | null }[] };
  certifications: { id: string; title: string; status: string; completionDate: string | null; expiryDate: string | null }[];
  documents: { id: string; title: string; signedAt: string }[];
  training: { moduleId: string; title: string; percent: number; status: string; completedAt: string | null }[];
  activity: { action: string; at: string; meta: Record<string, unknown> }[];
}

const certChip: Record<string, string> = {
  valid: 'bg-green-100 text-green-800',
  expiring: 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-800',
  pending: 'bg-muted text-muted-foreground',
};
const onbChip: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  in_progress: 'bg-blue-100 text-blue-800',
  blocked: 'bg-amber-100 text-amber-800',
  not_started: 'bg-muted text-muted-foreground',
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const TABS = ['Overview', 'Onboarding', 'Certifications', 'Documents', 'Training', 'Activity'] as const;
type Tab = (typeof TABS)[number];

export default function VolunteerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [p, setP] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const t = authToken();
      const res = await fetch(`/api/people/${id}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      if (!res.ok) throw new Error(res.status === 404 ? 'Volunteer not found' : `HTTP ${res.status}`);
      const data = await res.json();
      setP(data.person);
    } catch (e) { setError(e instanceof Error ? e.message : 'failed to load'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const doneSteps = p ? p.onboarding.steps.filter((s) => s.status === 'done').length : 0;
  const totalSteps = p ? p.onboarding.steps.length : 0;
  const onbPct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const expiringCount = p ? p.certifications.filter((c) => c.status === 'expiring').length : 0;
  const expiredCount = p ? p.certifications.filter((c) => c.status === 'expired').length : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => router.push('/dashboard/people')} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to People
      </button>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {p && !loading && !error ? (
        <>
          {/* Header */}
          <div className="rounded-xl border bg-card p-6 mb-6">
            <div className="flex flex-wrap items-start gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-[200px]">
                <h1 className="text-2xl font-bold">{p.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{roleManageLabel(p.role)}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>{p.isActive ? 'Active' : 'Inactive'}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${onbChip[p.onboarding.status] ?? ''}`}>Onboarding: {p.onboarding.status.replace('_', ' ')}</span>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <Info icon={<Hash className="h-4 w-4" />} label="Volunteer no." value={p.employeeNo} />
              <Info icon={<Building2 className="h-4 w-4" />} label="Program" value={p.department} />
              <Info icon={<Mail className="h-4 w-4" />} label="Email" value={p.email} />
              <Info icon={<Phone className="h-4 w-4" />} label="Phone" value={p.phone} />
              <Info icon={<CalendarDays className="h-4 w-4" />} label="Joined" value={fmt(p.dateOfJoining)} />
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex flex-wrap gap-1 border-b">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {t}
                {t === 'Certifications' && (expiringCount + expiredCount > 0) ? <span className="ml-1 inline-block rounded-full bg-red-100 text-red-800 text-[10px] px-1.5">{expiringCount + expiredCount}</span> : null}
              </button>
            ))}
          </div>

          {tab === 'Overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Stat label="Onboarding" value={`${onbPct}%`} sub={`${doneSteps}/${totalSteps} steps`} />
              <Stat label="Certifications" value={`${p.certifications.length}`} sub={expiredCount ? `${expiredCount} expired` : expiringCount ? `${expiringCount} expiring` : 'all current'} tone={expiredCount ? 'red' : expiringCount ? 'amber' : 'green'} />
              <Stat label="Training complete" value={`${p.training.filter((t) => t.status === 'complete').length}/${p.training.length}`} sub="modules" />
              <Stat label="Documents signed" value={`${p.documents.length}`} sub="on file" />
            </div>
          )}

          {tab === 'Onboarding' && (
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1 text-sm"><span className="font-medium">Progress</span><span className="text-muted-foreground">{doneSteps}/{totalSteps} ({onbPct}%)</span></div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${onbPct}%` }} /></div>
              </div>
              <ul className="space-y-2">
                {p.onboarding.steps.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                    {s.status === 'done' ? <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" /> : <Circle className="h-5 w-5 text-muted-foreground mt-0.5" />}
                    <div>
                      <p className={`text-sm font-medium ${s.status === 'done' ? 'text-foreground' : ''}`}>{s.title}</p>
                      {s.description ? <p className="text-xs text-muted-foreground">{s.description}</p> : null}
                      {s.completedAt ? <p className="text-[11px] text-green-700">Completed {fmt(s.completedAt)}</p> : null}
                    </div>
                  </li>
                ))}
                {p.onboarding.steps.length === 0 ? <li className="text-sm text-muted-foreground">No onboarding steps.</li> : null}
              </ul>
            </div>
          )}

          {tab === 'Certifications' && (
            <TableCard headers={['Certification', 'Status', 'Completed', 'Expires']} rows={p.certifications.map((c) => [
              c.title,
              <span key="s" className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${certChip[c.status] ?? ''}`}>{c.status}</span>,
              fmt(c.completionDate), fmt(c.expiryDate),
            ])} empty="No certifications recorded." />
          )}

          {tab === 'Documents' && (
            <TableCard headers={['Document', 'Signed']} rows={p.documents.map((d) => [d.title, fmt(d.signedAt)])} empty="No signed documents yet." />
          )}

          {tab === 'Training' && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              {p.training.length === 0 ? <p className="text-sm text-muted-foreground">No training assigned.</p> : null}
              {p.training.map((t) => (
                <div key={t.moduleId}>
                  <div className="flex items-center justify-between text-sm mb-1"><span className="font-medium">{t.title}</span><span className="text-muted-foreground">{t.percent}% · {t.status.replace('_', ' ')}</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${t.status === 'complete' ? 'bg-green-600' : 'bg-primary'}`} style={{ width: `${t.percent}%` }} /></div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Activity' && (
            <TableCard headers={['Action', 'When']} rows={p.activity.map((a) => [a.action, new Date(a.at).toLocaleString('en-AU')])} empty="No recorded activity." />
          )}
        </>
      ) : null}
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <div><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p><p className="font-medium truncate">{value || '—'}</p></div>
    </div>
  );
}
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'amber' | 'green' }) {
  const c = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : tone === 'green' ? 'text-green-700' : 'text-foreground';
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${c}`}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground mt-1">{sub}</p> : null}
    </div>
  );
}
function TableCard({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40"><tr>{headers.map((h) => <th key={h} className="text-left font-medium text-muted-foreground px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}
          {rows.length === 0 ? <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-muted-foreground">{empty}</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
