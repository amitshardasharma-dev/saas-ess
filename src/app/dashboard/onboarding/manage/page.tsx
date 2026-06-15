// /dashboard/onboarding/manage — edit the Volunteer & Staff onboarding flows (admin).
// Add / reorder / remove steps, set each step's type, link it to a document /
// certificate / training, and toggle auto-complete. Changes apply to people
// onboarded from now on (existing in-progress checklists are unchanged).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole, type UserRole } from '@/types/roles'
import {
  Loader2, Plus, Trash2, ArrowUp, ArrowDown, Save, Ban, ClipboardList,
  UserRound, FileSignature, ShieldCheck, Award, GraduationCap, Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

type Audience = 'volunteer' | 'staff'
type StepType = 'profile_field' | 'doc_sign' | 'doc_ack' | 'certification' | 'training' | 'manual'

interface Step {
  title: string
  description: string
  step_type: StepType
  ref_id: string
  auto_complete: boolean
}
interface Options {
  documents: { id: string; title: string }[]
  certTypes: { id: string; name: string }[]
  modules: { id: string; title: string }[]
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

export default function OnboardingFlowsPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  useEffect(() => { checkAuth() }, [checkAuth])
  const isAdmin = !!user && hasMinRole((user.role || 'employee') as UserRole, 'admin')

  const [audience, setAudience] = useState<Audience>('volunteer')
  const [vol, setVol] = useState<Step[]>([])
  const [staff, setStaff] = useState<Step[]>([])
  const [options, setOptions] = useState<Options>({ documents: [], certTypes: [], modules: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)

  const toSteps = (raw: unknown[]): Step[] => (raw ?? []).map((r) => {
    const s = r as Partial<Step>
    return { title: s.title ?? '', description: s.description ?? '', step_type: (s.step_type as StepType) ?? 'manual', ref_id: (s.ref_id as string) ?? '', auto_complete: Boolean(s.auto_complete) }
  })

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const res = await fetch('/api/onboarding/templates', { headers: authHeaders() })
      if (!res.ok) throw new Error('load')
      const d = await res.json()
      setVol(toSteps(d.templates?.volunteer?.steps))
      setStaff(toSteps(d.templates?.staff?.steps))
      setOptions(d.options ?? { documents: [], certTypes: [], modules: [] })
    } catch { setError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isAdmin) void load() }, [isAdmin, load])

  const steps = audience === 'volunteer' ? vol : staff
  const setSteps = audience === 'volunteer' ? setVol : setStaff
  const update = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps];[next[i], next[j]] = [next[j], next[i]]; setSteps(next)
  }
  const remove = (i: number) => setSteps(steps.filter((_, idx) => idx !== i))
  const add = () => setSteps([...steps, { title: '', description: '', step_type: 'manual', ref_id: '', auto_complete: false }])

  const save = async () => {
    for (const s of steps) {
      if (!s.title.trim()) { toast.error('Every step needs a title'); return }
      if (TYPE_META[s.step_type].refKind && !s.ref_id) { toast.error(`"${s.title}" needs a linked item to auto-complete`); return }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/templates', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          audience,
          steps: steps.map((s) => ({
            title: s.title.trim(),
            description: s.description.trim() || null,
            step_type: s.step_type,
            ref_id: TYPE_META[s.step_type].refKind ? s.ref_id || null : null,
            auto_complete: s.step_type === 'manual' ? false : s.auto_complete,
          })),
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error ?? 'save failed')
      setSteps(toSteps(d.template?.steps))
      toast.success(`${audience === 'volunteer' ? 'Volunteer' : 'Staff'} flow saved`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save') } finally { setSaving(false) }
  }

  if (!isAuthenticated || !user) {
    return <div className="mx-auto w-full max-w-4xl p-6"><Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</CardContent></Card></div>
  }
  if (!isAdmin) {
    return <div className="mx-auto w-full max-w-4xl p-6"><Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><Ban className="h-10 w-10 opacity-30" /> Only an admin can edit onboarding flows.</CardContent></Card></div>
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground"><ClipboardList className="h-6 w-6 text-muted-foreground" /> Onboarding Flows</h1>
          <p className="mt-1 text-sm text-muted-foreground">Design the checklist each new person works through. Changes apply to people onboarded from now on.</p>
        </div>
        <Button onClick={() => void save()} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save {audience === 'volunteer' ? 'volunteer' : 'staff'} flow
        </Button>
      </div>

      <div className="flex gap-1 border-b">
        {(['volunteer', 'staff'] as Audience[]).map((a) => (
          <button key={a} type="button" onClick={() => setAudience(a)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${audience === a ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {a} flow <span className="ml-1 text-xs text-muted-foreground">({(a === 'volunteer' ? vol : staff).length})</span>
          </button>
        ))}
      </div>

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
              <Card key={i}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{i + 1}</span>
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input value={s.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Step title" className="flex-1" />
                    <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Input value={s.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Short description (optional)" className="text-sm" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <select className={selectCls} value={s.step_type} onChange={(e) => update(i, { step_type: e.target.value as StepType, ref_id: '' })}>
                        {(Object.keys(TYPE_META) as StepType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                      </select>
                    </div>
                    {meta.refKind ? (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Linked {meta.refKind === 'document' ? 'document' : meta.refKind === 'cert_type' ? 'certificate' : 'training'}</Label>
                        <select className={selectCls} value={s.ref_id} onChange={(e) => update(i, { ref_id: e.target.value })}>
                          <option value="">Select…</option>
                          {meta.refKind === 'document' && options.documents.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                          {meta.refKind === 'cert_type' && options.certTypes.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          {meta.refKind === 'training_module' && options.modules.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                        </select>
                      </div>
                    ) : <div />}
                  </div>
                  {s.step_type !== 'manual' && s.step_type !== 'profile_field' ? (
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={s.auto_complete} onChange={(e) => update(i, { auto_complete: e.target.checked })} />
                      Auto-complete when the volunteer does this
                    </label>
                  ) : null}
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
