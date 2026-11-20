// /dashboard/onboarding/manage — edit the onboarding flows (admin).
//   - "All volunteers": steps every volunteer gets.
//   - One tab per volunteer type (Op shop, Events, ...): extra steps for people
//     with that type. A person with several types gets each type's steps; a
//     step that is in more than one flow appears once.
//   - "Staff": the staff flow.
// Add / reorder / remove steps, set each step's type, link it to a document /
// certificate / training, mark it mandatory or optional, and toggle
// auto-complete. Saving applies the flow to people who already exist too
// (new steps are added, already-satisfied ones land done, and completed steps
// are never reset or deleted).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole, type UserRole } from '@/types/roles'
import {
  Loader2, Plus, Trash2, ArrowUp, ArrowDown, Save, Ban, ClipboardList, Users, Pencil, Check, X,
  UserRound, FileSignature, ShieldCheck, Award, GraduationCap, Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

type StepType = 'profile_field' | 'doc_sign' | 'doc_ack' | 'certification' | 'training' | 'manual'
type FlowKey = string // 'volunteer' | 'staff' | `type:<id>`

interface Step {
  title: string
  description: string
  step_type: StepType
  ref_id: string
  auto_complete: boolean
  is_required: boolean
}
interface Options {
  documents: { id: string; title: string }[]
  certTypes: { id: string; name: string }[]
  modules: { id: string; title: string }[]
}
interface TypeInfo {
  id: string
  name: string
  description: string | null
  memberCount: number
}

const TYPE_META: Record<StepType, { label: string; Icon: React.ComponentType<{ className?: string }>; refKind: 'document' | 'cert_type' | 'training_module' | null }> = {
  profile_field: { label: 'Complete profile', Icon: UserRound, refKind: null },
  doc_sign: { label: 'Sign a document', Icon: FileSignature, refKind: 'document' },
  doc_ack: { label: 'Acknowledge a document', Icon: ShieldCheck, refKind: 'document' },
  certification: { label: 'Upload a certificate', Icon: Award, refKind: 'cert_type' },
  training: { label: 'Complete a training', Icon: GraduationCap, refKind: 'training_module' },
  manual: { label: 'Manual — staff marks done', Icon: Clock, refKind: null },
}
const selectCls = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

const toSteps = (raw: unknown[] | undefined): Step[] => (raw ?? []).map((r) => {
  const s = r as Partial<Step> & { is_required?: boolean | null }
  return {
    title: s.title ?? '',
    description: s.description ?? '',
    step_type: (s.step_type as StepType) ?? 'manual',
    ref_id: (s.ref_id as string) ?? '',
    auto_complete: Boolean(s.auto_complete),
    is_required: s.is_required !== false,
  }
})

function syncSummary(sync: unknown): string {
  const s = sync as { people?: number; added?: number; removed?: number; autoCompleted?: number } | undefined
  if (!s || (!s.added && !s.removed && !s.people)) return ''
  const parts: string[] = []
  if (s.people) parts.push(`${s.people} ${s.people === 1 ? 'person' : 'people'} updated`)
  if (s.added) parts.push(`${s.added} step${s.added === 1 ? '' : 's'} added`)
  if (s.removed) parts.push(`${s.removed} open step${s.removed === 1 ? '' : 's'} removed`)
  return ` — ${parts.join(', ')}`
}

export default function OnboardingFlowsPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  useEffect(() => { checkAuth() }, [checkAuth])
  const isAdmin = !!user && hasMinRole((user.role || 'employee') as UserRole, 'admin')

  const [active, setActive] = useState<FlowKey>('volunteer')
  const [flows, setFlows] = useState<Record<FlowKey, Step[]>>({})
  const [types, setTypes] = useState<TypeInfo[]>([])
  const [options, setOptions] = useState<Options>({ documents: [], certTypes: [], modules: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState<Record<FlowKey, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const res = await fetch('/api/onboarding/templates', { headers: authHeaders() })
      if (!res.ok) throw new Error('load')
      const d = await res.json()
      const next: Record<FlowKey, Step[]> = {
        volunteer: toSteps(d.templates?.volunteer?.steps),
        staff: toSteps(d.templates?.staff?.steps),
      }
      const ts: TypeInfo[] = (d.types ?? []).map((t: TypeInfo & { steps?: unknown[] }) => {
        next[`type:${t.id}`] = toSteps(t.steps)
        return { id: t.id, name: t.name, description: t.description ?? null, memberCount: t.memberCount ?? 0 }
      })
      setFlows(next)
      setTypes(ts)
      setDirty({})
      setOptions(d.options ?? { documents: [], certTypes: [], modules: [] })
    } catch { setError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isAdmin) void load() }, [isAdmin, load])

  const steps = flows[active] ?? []
  const setSteps = (next: Step[]) => { setFlows((f) => ({ ...f, [active]: next })); setDirty((d) => ({ ...d, [active]: true })) }
  const update = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps];[next[i], next[j]] = [next[j], next[i]]; setSteps(next)
  }
  const remove = (i: number) => setSteps(steps.filter((_, idx) => idx !== i))
  const add = () => setSteps([...steps, { title: '', description: '', step_type: 'manual', ref_id: '', auto_complete: false, is_required: true }])

  const activeType = active.startsWith('type:') ? types.find((t) => `type:${t.id}` === active) ?? null : null
  const flowName = active === 'volunteer' ? 'All volunteers' : active === 'staff' ? 'Staff' : activeType?.name ?? 'Flow'

  const save = async () => {
    for (const s of steps) {
      if (!s.title.trim()) { toast.error('Every step needs a title'); return }
      if (TYPE_META[s.step_type].refKind && !s.ref_id) { toast.error(`"${s.title}" needs a linked item to auto-complete`); return }
    }
    setSaving(true)
    try {
      const target = activeType ? { type_id: activeType.id } : { audience: active }
      const res = await fetch('/api/onboarding/templates', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...target,
          steps: steps.map((s) => ({
            title: s.title.trim(),
            description: s.description.trim() || null,
            step_type: s.step_type,
            ref_id: TYPE_META[s.step_type].refKind ? s.ref_id || null : null,
            auto_complete: s.step_type === 'manual' ? false : s.auto_complete,
            is_required: s.is_required,
          })),
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error ?? 'save failed')
      setFlows((f) => ({ ...f, [active]: toSteps(d.template?.steps) }))
      setDirty((x) => ({ ...x, [active]: false }))
      toast.success(`${flowName} flow saved${syncSummary(d.sync)}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save') } finally { setSaving(false) }
  }

  if (!isAuthenticated || !user) {
    return <div className="mx-auto w-full max-w-4xl p-6"><Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</CardContent></Card></div>
  }
  if (!isAdmin) {
    return <div className="mx-auto w-full max-w-4xl p-6"><Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><Ban className="h-10 w-10 opacity-30" /> Only an admin can edit onboarding flows.</CardContent></Card></div>
  }

  const tabs: { key: FlowKey; label: string }[] = [
    { key: 'volunteer', label: 'All volunteers' },
    ...types.map((t) => ({ key: `type:${t.id}`, label: t.name })),
    { key: 'staff', label: 'Staff' },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground"><ClipboardList className="h-6 w-6 text-muted-foreground" /> Onboarding Flows</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A volunteer gets the steps for all volunteers plus the steps for each of their volunteer types. Saving applies your changes to existing people too — anything they have already done stays done.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save {flowName} flow
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-1 border-b" role="tablist" aria-label="Onboarding flows">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${active === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label} <span className="ml-1 text-xs text-muted-foreground">({(flows[t.key] ?? []).length})</span>
            {dirty[t.key] ? <span className="ml-1 text-amber-600" title="Unsaved changes">•</span> : null}
          </button>
        ))}
        <AddTypeButton onCreated={async (t) => { await load(); setActive(`type:${t.id}`) }} />
      </div>

      {activeType ? (
        <TypeHeader
          type={activeType}
          onRenamed={(name) => setTypes((ts) => ts.map((t) => (t.id === activeType.id ? { ...t, name } : t)))}
          onDeleted={async () => { setActive('volunteer'); await load() }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {active === 'volunteer'
            ? 'Steps that every volunteer gets, whatever their volunteer type.'
            : 'Steps for staff members.'}
        </p>
      )}

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading flows…</CardContent></Card>
      ) : error ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Could not load onboarding flows.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {steps.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No steps yet — add the first one below.</CardContent></Card>
          ) : steps.map((s, i) => {
            const meta = TYPE_META[s.step_type]
            const Icon = meta.Icon
            return (
              <Card key={i} data-testid="flow-step">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{i + 1}</span>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input value={s.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Step title" className="flex-1" aria-label={`Step ${i + 1} title`} />
                    <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Input value={s.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Short description (optional)" className="text-sm" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <select className={selectCls} value={s.step_type} onChange={(e) => update(i, { step_type: e.target.value as StepType, ref_id: '' })} aria-label={`Step ${i + 1} type`}>
                        {(Object.keys(TYPE_META) as StepType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                      </select>
                    </div>
                    {meta.refKind ? (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Linked {meta.refKind === 'document' ? 'document' : meta.refKind === 'cert_type' ? 'certificate' : 'training'}</Label>
                        <select className={selectCls} value={s.ref_id} onChange={(e) => update(i, { ref_id: e.target.value })} aria-label={`Step ${i + 1} linked item`}>
                          <option value="">Select…</option>
                          {meta.refKind === 'document' && options.documents.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                          {meta.refKind === 'cert_type' && options.certTypes.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          {meta.refKind === 'training_module' && options.modules.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                        </select>
                      </div>
                    ) : <div />}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={s.is_required} onChange={(e) => update(i, { is_required: e.target.checked })} />
                      Mandatory (must be done before approval)
                    </label>
                    {s.step_type !== 'manual' && s.step_type !== 'profile_field' ? (
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" checked={s.auto_complete} onChange={(e) => update(i, { auto_complete: e.target.checked })} />
                        Auto-complete when the volunteer does this
                      </label>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}

          <Button variant="outline" onClick={add}><Plus className="h-4 w-4" /> Add step</Button>
        </div>
      )}
    </div>
  )
}

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error || `HTTP ${res.status}`)
  return d as Record<string, unknown>
}

function AddTypeButton({ onCreated }: { onCreated: (t: { id: string; name: string }) => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const d = await api('POST', '/api/volunteer-types', { name: name.trim() })
      const t = d.type as { id: string; name: string }
      toast.success(`Volunteer type “${t.name}” added. Now add its steps.`)
      setName(''); setOpen(false)
      await onCreated(t)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not add the type') } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="-mb-px flex items-center gap-1 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-primary hover:underline">
        <Plus className="h-4 w-4" /> Add volunteer type
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="mb-1 flex items-center gap-1 px-2">
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Op shop" className="h-8 w-40 text-sm" maxLength={80} aria-label="New volunteer type name" />
      <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setName('') }} aria-label="Cancel"><X className="h-4 w-4" /></Button>
    </form>
  )
}

function TypeHeader({ type, onRenamed, onDeleted }: { type: TypeInfo; onRenamed: (name: string) => void; onDeleted: () => void | Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(type.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setName(type.name); setEditing(false); setConfirmDelete(false) }, [type.id, type.name])

  const rename = async () => {
    if (!name.trim() || name.trim() === type.name) { setEditing(false); return }
    setBusy(true)
    try {
      await api('PATCH', `/api/volunteer-types/${type.id}`, { name: name.trim() })
      onRenamed(name.trim()); setEditing(false); toast.success('Type renamed')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not rename') } finally { setBusy(false) }
  }
  const del = async () => {
    setBusy(true)
    try {
      const d = await api('DELETE', `/api/volunteer-types/${type.id}`)
      toast.success(`“${type.name}” deleted${(d.members as number) ? ` — ${d.members} ${(d.members as number) === 1 ? 'person' : 'people'} updated` : ''}`)
      await onDeleted()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete') } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        {editing ? (
          <>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-52 text-sm" maxLength={80} aria-label="Type name" autoFocus />
            <Button size="sm" onClick={() => void rename()} disabled={busy} aria-label="Save name"><Check className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(type.name) }} aria-label="Cancel rename"><X className="h-4 w-4" /></Button>
          </>
        ) : (
          <>
            <p className="text-sm">Extra steps for people with the type <strong>{type.name}</strong>.</p>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Rename type"><Pencil className="h-3.5 w-3.5" /></Button>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> {type.memberCount} {type.memberCount === 1 ? 'person' : 'people'}</span>
        {confirmDelete ? (
          <>
            <span className="text-xs text-destructive">Delete this type? Open steps from it are removed. Completed steps stay.</span>
            <Button size="sm" variant="destructive" onClick={() => void del()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Delete type
          </Button>
        )}
      </div>
    </div>
  )
}
