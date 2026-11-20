'use client';

// Onboarding tab of a person's profile (/dashboard/people/[id]).
//   - Approval: approve when every mandatory step is resolved; revoke.
//   - Volunteer types: change the person's types (re-syncs their checklist).
//   - Steps: mark done / undo (staff), "not needed" / restore and remove a
//     personal step (admin), and add a step for this person only (admin).

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2, Circle, Ban, Plus, Loader2, ShieldCheck, Undo2, Trash2, Tags, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ONBOARDING_STATUS_CHIP,
  onboardingStatusLabel,
  type OnboardingStatus,
  type OnboardingStepType,
} from '@/types/onboarding';

export interface PanelStep {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sortOrder: number;
  completedAt: string | null;
  stepType: string;
  refId: string | null;
  isRequired: boolean;
  origin: string;
  waivedAt: string | null;
  waivedBy: string | null;
  waiveReason: string | null;
}

export interface PanelPerson {
  id: string;
  name: string;
  onboarding: {
    status: string;
    completedAt: string | null;
    approvedAt: string | null;
    approvedBy: string | null;
    steps: PanelStep[];
  };
  volunteerTypes: { id: string; name: string }[];
}

interface Options {
  documents: { id: string; title: string }[];
  certTypes: { id: string; name: string }[];
  modules: { id: string; title: string }[];
}

const STEP_TYPE_LABEL: Record<OnboardingStepType, string> = {
  profile_field: 'Complete profile',
  doc_sign: 'Sign a document',
  doc_ack: 'Acknowledge a document',
  certification: 'Upload a certificate',
  training: 'Complete a training',
  manual: 'Manual — staff marks done',
};
const REF_KIND: Partial<Record<OnboardingStepType, 'document' | 'cert_type' | 'training_module'>> = {
  doc_sign: 'document',
  doc_ack: 'document',
  certification: 'cert_type',
  training: 'training_module',
};

const selectCls =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null;
  return { ...extra, ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as Record<string, unknown>;
}

function syncSummary(sync: unknown): string {
  const s = sync as { added?: number; removed?: number; autoCompleted?: number } | undefined;
  if (!s) return '';
  const parts: string[] = [];
  if (s.added) parts.push(`${s.added} step${s.added === 1 ? '' : 's'} added`);
  if (s.autoCompleted) parts.push(`${s.autoCompleted} already done`);
  if (s.removed) parts.push(`${s.removed} open step${s.removed === 1 ? '' : 's'} removed`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

export function PersonOnboardingPanel({
  person,
  isAdmin,
  isStaff,
  onChanged,
}: {
  person: PanelPerson;
  /** Admin: types, approval, not needed, add/remove steps. */
  isAdmin: boolean;
  /** Manager+: mark steps done / undo. */
  isStaff: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const steps = [...person.onboarding.steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const status = (person.onboarding.status || 'not_started') as OnboardingStatus;
  const resolved = (s: PanelStep) => s.status === 'done' || s.status === 'skipped';
  const doneCount = steps.filter(resolved).length;
  const required = steps.filter((s) => s.isRequired);
  const requiredOpen = required.filter((s) => !resolved(s)).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;

  const [busy, setBusy] = useState<string | null>(null);
  const [waiveId, setWaiveId] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');

  const run = useCallback(
    async (key: string, fn: () => Promise<string | void>) => {
      setBusy(key);
      try {
        const msg = await fn();
        if (msg) toast.success(msg);
        await onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setBusy(null);
      }
    },
    [onChanged],
  );

  const setStepStatus = (s: PanelStep, next: 'done' | 'pending' | 'skipped', reason?: string) =>
    run(`step-${s.id}`, async () => {
      await call('PATCH', `/api/onboarding/steps/${s.id}`, { status: next, ...(reason ? { reason } : {}) });
      setWaiveId(null);
      setWaiveReason('');
      return next === 'skipped' ? `“${s.title}” marked as not needed` : next === 'done' ? `“${s.title}” marked done` : `“${s.title}” is open again`;
    });

  const removeStep = (s: PanelStep) =>
    run(`step-${s.id}`, async () => {
      await call('DELETE', `/api/onboarding/steps/${s.id}`);
      return `“${s.title}” removed`;
    });

  const approval = (action: 'approve' | 'revoke') =>
    run('approval', async () => {
      await call('POST', '/api/onboarding/approval', { employee_id: person.id, action });
      return action === 'approve' ? `${person.name} is approved. We sent them an email.` : 'Approval taken back';
    });

  return (
    <div className="space-y-4">
      {/* Status + approval */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ONBOARDING_STATUS_CHIP[status] ?? ''}`}>
                {onboardingStatusLabel(status)}
              </span>
              <span className="text-sm text-muted-foreground">
                {doneCount} of {steps.length} steps complete
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground" data-testid="approval-text">
              {person.onboarding.approvedAt
                ? `Approved by ${person.onboarding.approvedBy ?? 'an admin'} on ${fmt(person.onboarding.approvedAt)}.${
                    requiredOpen ? ` ${requiredOpen} new mandatory step${requiredOpen === 1 ? ' is' : 's are'} open.` : ''
                  }`
                : status === 'completed'
                  ? 'All mandatory steps are complete. This person is ready for approval.'
                  : requiredOpen
                    ? `${requiredOpen} mandatory step${requiredOpen === 1 ? '' : 's'} still open. Optional steps do not stop approval.`
                    : 'No mandatory steps.'}
            </p>
          </div>
          {isAdmin ? (
            person.onboarding.approvedAt ? (
              <Button variant="outline" size="sm" onClick={() => void approval('revoke')} disabled={busy === 'approval'}>
                {busy === 'approval' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Revoke approval
              </Button>
            ) : (
              <Button size="sm" onClick={() => void approval('approve')} disabled={status !== 'completed' || busy === 'approval'}>
                {busy === 'approval' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Approve
              </Button>
            )
          ) : null}
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Volunteer types */}
      <TypesEditor person={person} isAdmin={isAdmin} onChanged={onChanged} />

      {/* Steps */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">Steps</h3>
        <ul className="divide-y">
          {steps.map((s) => {
            const isDone = s.status === 'done';
            const isWaived = s.status === 'skipped';
            const rowBusy = busy === `step-${s.id}`;
            return (
              <li key={s.id} className="py-3" data-testid="person-step">
                <div className="flex items-start gap-3">
                  {isDone ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-label="Done" />
                  ) : isWaived ? (
                    <Ban className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="Not needed" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="Open" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`text-sm font-medium ${isWaived ? 'text-muted-foreground line-through' : ''}`}>{s.title}</p>
                      {!s.isRequired ? <Chip>Optional</Chip> : null}
                      {s.origin === 'personal' ? <Chip tone="blue">Only for this person</Chip> : null}
                      {isWaived ? <Chip tone="amber">Not needed</Chip> : null}
                    </div>
                    {s.description ? <p className="text-xs text-muted-foreground">{s.description}</p> : null}
                    {isDone && s.completedAt ? <p className="text-[11px] text-green-700">Completed {fmt(s.completedAt)}</p> : null}
                    {isWaived ? (
                      <p className="text-[11px] text-muted-foreground">
                        Marked not needed by {s.waivedBy ?? 'an admin'} on {fmt(s.waivedAt)}
                        {s.waiveReason ? ` — “${s.waiveReason}”` : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {rowBusy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    {!isDone && !isWaived && isStaff ? (
                      <Button size="sm" variant="outline" onClick={() => void setStepStatus(s, 'done')} disabled={rowBusy}>Mark done</Button>
                    ) : null}
                    {isDone && isStaff && s.stepType === 'manual' ? (
                      <Button size="sm" variant="ghost" onClick={() => void setStepStatus(s, 'pending')} disabled={rowBusy}>Undo</Button>
                    ) : null}
                    {!isDone && !isWaived && isAdmin && s.origin !== 'personal' ? (
                      <Button size="sm" variant="ghost" onClick={() => { setWaiveId(s.id); setWaiveReason(''); }} disabled={rowBusy}>Not needed</Button>
                    ) : null}
                    {isWaived && isAdmin ? (
                      <Button size="sm" variant="ghost" onClick={() => void setStepStatus(s, 'pending')} disabled={rowBusy}>Restore</Button>
                    ) : null}
                    {!isDone && isAdmin && s.origin === 'personal' ? (
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => void removeStep(s)} disabled={rowBusy} aria-label={`Remove ${s.title}`}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                {waiveId === s.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                    <Input
                      value={waiveReason}
                      onChange={(e) => setWaiveReason(e.target.value)}
                      placeholder="Reason (optional), e.g. works only in the office"
                      className="h-8 max-w-sm text-sm"
                      aria-label="Reason this step is not needed"
                      maxLength={500}
                    />
                    <Button size="sm" onClick={() => void setStepStatus(s, 'skipped', waiveReason.trim() || undefined)} disabled={rowBusy}>
                      Confirm not needed
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setWaiveId(null)}>Cancel</Button>
                  </div>
                ) : null}
              </li>
            );
          })}
          {steps.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No onboarding steps.</li> : null}
        </ul>
        {isAdmin ? <AddStepForm employeeId={person.id} onAdded={onChanged} /> : null}
      </div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'blue' | 'amber' }) {
  const cls = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-muted text-muted-foreground';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

function TypesEditor({ person, isAdmin, onChanged }: { person: PanelPerson; isAdmin: boolean; onChanged: () => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const open = async () => {
    setEditing(true);
    setPicked(person.volunteerTypes.map((t) => t.id));
    try {
      const d = await call('GET', '/api/volunteer-types');
      setAll((d.types as { id: string; name: string }[]) ?? []);
    } catch {
      setAll([]);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const d = await call('PUT', `/api/people/${person.id}/volunteer-types`, { type_ids: picked });
      toast.success(`Volunteer types saved${syncSummary(d.sync)}`);
      setEditing(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Tags className="h-4 w-4 text-muted-foreground" /> Volunteer types</h3>
        {isAdmin && !editing ? <Button size="sm" variant="outline" onClick={() => void open()}>Change</Button> : null}
      </div>
      {!editing ? (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="person-types">
          {person.volunteerTypes.length ? (
            person.volunteerTypes.map((t) => (
              <span key={t.id} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">{t.name}</span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">No volunteer type. This person has the steps for all volunteers only.</span>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {all.length === 0 ? (
            <p className="text-sm text-muted-foreground">No volunteer types yet. Add them on the Onboarding Flows page.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {all.map((t) => {
                const on = picked.includes(t.id);
                return (
                  <label key={t.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${on ? 'border-primary bg-primary/10' : 'text-muted-foreground'}`}>
                    <input type="checkbox" checked={on} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, t.id] : cur.filter((x) => x !== t.id)))} />
                    {t.name}
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Steps for a new type are added. Open steps that no type needs any more are removed. Completed steps always stay.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save types</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}><X className="h-4 w-4" /> Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddStepForm({ employeeId, onAdded }: { employeeId: string; onAdded: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepType, setStepType] = useState<OnboardingStepType>('manual');
  const [refId, setRefId] = useState('');
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || options) return;
    call('GET', '/api/onboarding/templates')
      .then((d) => setOptions((d.options as Options) ?? { documents: [], certTypes: [], modules: [] }))
      .catch(() => setOptions({ documents: [], certTypes: [], modules: [] }));
  }, [open, options]);

  const kind = REF_KIND[stepType];
  const refList: { id: string; label: string }[] = !options || !kind
    ? []
    : kind === 'document'
      ? options.documents.map((o) => ({ id: o.id, label: o.title }))
      : kind === 'cert_type'
        ? options.certTypes.map((o) => ({ id: o.id, label: o.name }))
        : options.modules.map((o) => ({ id: o.id, label: o.title }));

  const pickRef = (id: string) => {
    setRefId(id);
    const label = refList.find((r) => r.id === id)?.label;
    if (label && !title.trim()) setTitle(label);
  };

  const reset = () => {
    setTitle(''); setDescription(''); setStepType('manual'); setRefId(''); setRequired(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Give the step a title'); return; }
    if (kind && !refId) { toast.error('Select the linked item'); return; }
    setSaving(true);
    try {
      await call('POST', '/api/onboarding/steps', {
        employee_id: employeeId,
        title: title.trim(),
        description: description.trim() || null,
        step_type: stepType,
        ref_id: kind ? refId : null,
        is_required: required,
      });
      toast.success(`“${title.trim()}” added for this person`);
      reset();
      setOpen(false);
      await onAdded();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : 'Could not add the step');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="mt-4" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add a step for this person
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-4" aria-label="Add a step for this person">
      <p className="text-sm font-medium">Add a step for this person only</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="ps-type">Type</label>
          <select id="ps-type" className={selectCls} value={stepType} onChange={(e) => { setStepType(e.target.value as OnboardingStepType); setRefId(''); }}>
            {(Object.keys(STEP_TYPE_LABEL) as OnboardingStepType[]).map((t) => <option key={t} value={t}>{STEP_TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        {kind ? (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="ps-ref">Linked {kind === 'document' ? 'document' : kind === 'cert_type' ? 'certificate' : 'training'}</label>
            <select id="ps-ref" className={selectCls} value={refId} onChange={(e) => pickRef(e.target.value)}>
              <option value="">{options ? 'Select…' : 'Loading…'}</option>
              {refList.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        ) : <div />}
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="ps-title">Title</label>
        <Input id="ps-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Working with Children Check" maxLength={200} />
      </div>
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" className="text-sm" maxLength={2000} aria-label="Description" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Mandatory (must be done before approval)
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add step</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { reset(); setOpen(false); }} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}
