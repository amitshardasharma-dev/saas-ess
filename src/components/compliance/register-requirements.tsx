// Admin requirements manager: define which certificates + trainings are
// required, and for whom (Volunteers / Staff / Everyone / a specific group).
// Drives the whole register. Admin only (the page gates this tab).
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Trash2, ShieldCheck, GraduationCap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import toast from 'react-hot-toast'
import type { ComplianceRequirementView, RequirementKind } from '@/types/compliance-register'

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

interface Option { id: string; label: string }

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function RegisterRequirements() {
  const [requirements, setRequirements] = useState<ComplianceRequirementView[]>([])
  const [certTypes, setCertTypes] = useState<Option[]>([])
  const [modules, setModules] = useState<Option[]>([])
  const [groups, setGroups] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)

  const [kind, setKind] = useState<RequirementKind>('certification')
  const [refId, setRefId] = useState('')
  const [target, setTarget] = useState('tier:volunteer')
  const [adding, setAdding] = useState(false)

  const loadRequirements = useCallback(async () => {
    const res = await fetch('/api/compliance/requirements', { headers: authHeaders() })
    if (res.ok) setRequirements(((await res.json()).requirements ?? []) as ComplianceRequirementView[])
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [reqs, ct, mod, grp] = await Promise.all([
          fetch('/api/compliance/requirements', { headers: authHeaders() }).then((r) => r.json()).catch(() => null),
          fetch('/api/cert-types', { headers: authHeaders() }).then((r) => r.json()).catch(() => null),
          fetch('/api/training/modules', { headers: authHeaders() }).then((r) => r.json()).catch(() => null),
          fetch('/api/training/groups', { headers: authHeaders() }).then((r) => r.json()).catch(() => null),
        ])
        setRequirements((reqs?.requirements ?? []) as ComplianceRequirementView[])
        setCertTypes(((ct?.cert_types ?? []) as { id: string; name: string }[]).map((t) => ({ id: t.id, label: t.name })))
        setModules(((mod?.modules ?? []) as { id: string; title: string }[]).map((m) => ({ id: m.id, label: m.title })))
        setGroups(((grp?.groups ?? []) as { id: string; name: string }[]).map((g) => ({ id: g.id, label: g.name })))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const options = kind === 'certification' ? certTypes : modules

  const targetLabel = useCallback((tt: string, tv: string): string => {
    if (tt === 'tier') return tv === 'all' ? 'Everyone' : tv === 'staff' ? 'Staff' : 'Volunteers'
    const g = groups.find((x) => x.id === tv)
    return g ? `Group: ${g.label}` : 'Group'
  }, [groups])

  const add = async () => {
    if (!refId) { toast.error('Choose an item'); return }
    const [target_type, target_value] = target.split(':')
    setAdding(true)
    try {
      const res = await fetch('/api/compliance/requirements', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ kind, ref_id: refId, target_type, target_value }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Could not add requirement')
      toast.success('Requirement added')
      setRefId('')
      await loadRequirements()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add requirement')
    } finally {
      setAdding(false)
    }
  }

  const remove = async (id: string) => {
    const snapshot = requirements
    setRequirements((prev) => prev.filter((r) => r.id !== id))
    try {
      const res = await fetch(`/api/compliance/requirements/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error()
    } catch {
      setRequirements(snapshot)
      toast.error('Could not remove requirement')
    }
  }

  const certReqs = useMemo(() => requirements.filter((r) => r.kind === 'certification'), [requirements])
  const trainReqs = useMemo(() => requirements.filter((r) => r.kind === 'training'), [requirements])

  if (loading) return <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading requirements…</CardContent></Card>

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-muted-foreground" /> Add a requirement</CardTitle>
          <CardDescription>Pick a certificate or training and who must complete it. It appears on their register immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <select className={selectCls} value={kind} onChange={(e) => { setKind(e.target.value as RequirementKind); setRefId('') }}>
                <option value="certification">Certificate</option>
                <option value="training">Training</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">{kind === 'certification' ? 'Certificate' : 'Training module'}</label>
              <select className={selectCls} value={refId} onChange={(e) => setRefId(e.target.value)}>
                <option value="">Select…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Applies to</label>
              <select className={selectCls} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="tier:volunteer">Volunteers</option>
                <option value="tier:staff">Staff</option>
                <option value="tier:all">Everyone</option>
                {groups.length > 0 ? <optgroup label="Groups">{groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.label}</option>)}</optgroup> : null}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={() => void add()} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add requirement
            </Button>
          </div>
        </CardContent>
      </Card>

      <RequirementList title="Required certificates" Icon={ShieldCheck} rows={certReqs} targetLabel={targetLabel} onRemove={remove} />
      <RequirementList title="Required trainings" Icon={GraduationCap} rows={trainReqs} targetLabel={targetLabel} onRemove={remove} />
    </div>
  )
}

function RequirementList({ title, Icon, rows, targetLabel, onRemove }: {
  title: string
  Icon: React.ComponentType<{ className?: string }>
  rows: ComplianceRequirementView[]
  targetLabel: (tt: string, tv: string) => string
  onRemove: (id: string) => void
}) {
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="h-4 w-4 text-muted-foreground" /> {title}</h2>
      <Card><CardContent className="divide-y p-0">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">None yet.</div>
        ) : rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.ref_name ?? '(unknown)'}</span>
            <Badge variant="outline">{targetLabel(r.target_type, r.target_value)}</Badge>
            <Button variant="ghost" size="sm" onClick={() => onRemove(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </CardContent></Card>
    </div>
  )
}
