'use client'

// /dashboard/onboarding/progress — onboarding progress for everyone (staff+).
// Shows each person's volunteer types, status and "4 of 6 steps", with the open
// steps. Filter by type and status. Admins can approve people who are ready,
// and give a volunteer type to many people at one time.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Loader2, ListChecks, ShieldCheck, ChevronDown, ChevronUp, Ban } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole, roleManageLabel, type UserRole } from '@/types/roles'
import {
  ONBOARDING_STATUSES,
  ONBOARDING_STATUS_CHIP,
  onboardingStatusLabel,
  type OnboardingStatus,
  type ProgressRow,
} from '@/types/onboarding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return { ...extra, ...(t ? { Authorization: `Bearer ${t}` } : {}) }
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

export default function OnboardingProgressPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  useEffect(() => { checkAuth() }, [checkAuth])
  const role = ((user?.role as UserRole) || 'employee')
  const isAdmin = !!user && (user.is_super_admin === true || role === 'admin')
  const canView = !!user && (isAdmin || hasMinRole(role, 'manager'))

  const [people, setPeople] = useState<ProgressRow[]>([])
  const [types, setTypes] = useState<{ id: string; name: string; memberCount: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | 'all'>('all')
  const [roleFilter, setRoleFilter] = useState<'volunteers' | 'staff' | 'all'>('volunteers')
  const [showInactive, setShowInactive] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkType, setBulkType] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const d = await api('GET', '/api/onboarding/progress')
      setPeople((d.people as ProgressRow[]) ?? [])
      setTypes((d.types as { id: string; name: string; memberCount: number }[]) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { if (canView) void load() }, [canView, load])

  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types])

  // Every filter except status. The status cards use this, so they count the
  // same people as the table (for example volunteers only).
  const inScope = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => {
      if (!showInactive && !p.isActive) return false
      if (roleFilter === 'volunteers' && p.role !== 'employee') return false
      if (roleFilter === 'staff' && p.role === 'employee') return false
      if (typeFilter === 'none' && p.typeIds.length > 0) return false
      if (typeFilter !== 'all' && typeFilter !== 'none' && !p.typeIds.includes(typeFilter)) return false
      if (q && !`${p.name} ${p.email ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [people, query, typeFilter, roleFilter, showInactive])

  const filtered = useMemo(
    () => (statusFilter === 'all' ? inScope : inScope.filter((p) => p.status === statusFilter)),
    [inScope, statusFilter]
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of inScope) c[p.status] = (c[p.status] ?? 0) + 1
    return c
  }, [inScope])

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.employeeId))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((p) => p.employeeId)))
  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const approve = async (p: ProgressRow) => {
    setBusy(`approve-${p.employeeId}`)
    try {
      await api('POST', '/api/onboarding/approval', { employee_id: p.employeeId, action: 'approve' })
      toast.success(`${p.name} is approved. We sent them an email.`)
      await load(true)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not approve') } finally { setBusy(null) }
  }

  const bulk = async (action: 'add' | 'remove') => {
    if (!bulkType || selected.size === 0) return
    setBusy('bulk')
    try {
      const d = await api('POST', '/api/people/volunteer-types', { employee_ids: [...selected], type_id: bulkType, action })
      const sync = d.sync as { added?: number; removed?: number } | undefined
      const name = typeName.get(bulkType) ?? 'the type'
      toast.success(
        `${action === 'add' ? 'Gave' : 'Removed'} “${name}” ${action === 'add' ? 'to' : 'from'} ${d.changed as number} ${(d.changed as number) === 1 ? 'person' : 'people'}` +
          (sync?.added ? ` — ${sync.added} steps added` : '') + (sync?.removed ? ` — ${sync.removed} open steps removed` : ''),
      )
      setSelected(new Set())
      await load(true)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not update') } finally { setBusy(null) }
  }

  if (!isAuthenticated || !user) {
    return <div className="mx-auto w-full max-w-6xl p-6"><Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</CardContent></Card></div>
  }
  if (!canView) {
    return <div className="mx-auto w-full max-w-6xl p-6"><Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><Ban className="h-10 w-10 opacity-30" /> Only staff can see onboarding progress.</CardContent></Card></div>
  }

  const th = 'text-left font-medium text-muted-foreground px-3 py-2'
  const td = 'px-3 py-2 align-top'

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ListChecks className="h-6 w-6 text-muted-foreground" /> Onboarding Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">Each person, their volunteer types and their onboarding progress. Click a name to change their steps.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['completed', 'in_progress', 'not_started', 'approved'] as OnboardingStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`status-card-${s}`}
            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            className={`rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/30 ${statusFilter === s ? 'ring-2 ring-primary' : ''}`}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{onboardingStatusLabel(s)}</p>
            <p className="mt-1 text-2xl font-bold">{counts[s] ?? 0}</p>
          </button>
        ))}
      </div>

      <div role="search" className="flex flex-wrap items-center gap-2">
        <Input type="search" placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" className="max-w-xs" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} aria-label="Filter by role" className={selectCls}>
          <option value="volunteers">Volunteers</option>
          <option value="staff">Staff</option>
          <option value="all">Everyone</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by volunteer type" className={selectCls}>
          <option value="all">All volunteer types</option>
          <option value="none">No volunteer type</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OnboardingStatus | 'all')} aria-label="Filter by onboarding status" className={selectCls}>
          <option value="all">All statuses</option>
          {ONBOARDING_STATUSES.map((s) => <option key={s} value={s}>{onboardingStatusLabel(s)}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} of {people.length}</span>
      </div>

      {isAdmin && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm" data-testid="bulk-bar">
          <span className="font-medium">{selected.size} selected</span>
          <select value={bulkType} onChange={(e) => setBulkType(e.target.value)} aria-label="Volunteer type for selected people" className={selectCls}>
            <option value="">Select a volunteer type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Button size="sm" onClick={() => void bulk('add')} disabled={!bulkType || busy === 'bulk'}>
            {busy === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Give this type
          </Button>
          <Button size="sm" variant="outline" onClick={() => void bulk('remove')} disabled={!bulkType || busy === 'bulk'}>Remove this type</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          {types.length === 0 ? <span className="text-xs text-muted-foreground">Add volunteer types on the Onboarding Flows page first.</span> : null}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">Could not load progress: {error}</p> : null}

      {!loading && !error ? (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                {isAdmin ? (
                  <th className={`${th} w-8`}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all shown people" />
                  </th>
                ) : null}
                <th className={th}>Name</th>
                <th className={th}>Volunteer types</th>
                <th className={th}>Status</th>
                <th className={th}>Progress</th>
                <th className={th}>Open steps</th>
                {isAdmin ? <th className={th}></th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const pct = p.total ? Math.round((p.resolved / p.total) * 100) : 0
                const mandatoryOpen = p.requiredTotal - p.requiredResolved
                const open = expanded[p.employeeId]
                const shown = open ? p.openSteps : p.openSteps.slice(0, 2)
                return (
                  <tr key={p.employeeId} className="border-b last:border-0 hover:bg-muted/20" data-testid="progress-row">
                    {isAdmin ? (
                      <td className={td}>
                        <input type="checkbox" checked={selected.has(p.employeeId)} onChange={() => toggle(p.employeeId)} aria-label={`Select ${p.name}`} />
                      </td>
                    ) : null}
                    <td className={`${td} font-medium`}>
                      <Link href={`/dashboard/people/${p.employeeId}`} className="text-primary hover:underline">{p.name}</Link>
                      <p className="text-xs font-normal text-muted-foreground">{roleManageLabel(p.role as UserRole)}{p.isActive ? '' : ' · inactive'}</p>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {p.typeIds.length ? p.typeIds.map((id) => (
                          <span key={id} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{typeName.get(id) ?? '—'}</span>
                        )) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className={td}>
                      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ONBOARDING_STATUS_CHIP[p.status] ?? ''}`}>{onboardingStatusLabel(p.status)}</span>
                      {p.approvedAt ? <p className="mt-1 text-[11px] text-muted-foreground">by {p.approvedBy ?? 'an admin'}</p> : null}
                    </td>
                    <td className={`${td} min-w-[140px]`}>
                      <p className="whitespace-nowrap">{p.resolved} of {p.total} steps</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                      {mandatoryOpen > 0 ? <p className="mt-1 text-[11px] text-muted-foreground">{mandatoryOpen} mandatory open</p> : null}
                    </td>
                    <td className={td}>
                      {p.openSteps.length === 0 ? <span className="text-xs text-muted-foreground">None</span> : (
                        <ul className="space-y-0.5">
                          {shown.map((s) => (
                            <li key={s.id} className="text-xs">
                              {s.title}{s.isRequired ? '' : <span className="text-muted-foreground"> (optional)</span>}
                            </li>
                          ))}
                          {p.openSteps.length > 2 ? (
                            <li>
                              <button type="button" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline" onClick={() => setExpanded((x) => ({ ...x, [p.employeeId]: !open }))}>
                                {open ? <>Show less <ChevronUp className="h-3 w-3" /></> : <>+{p.openSteps.length - 2} more <ChevronDown className="h-3 w-3" /></>}
                              </button>
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </td>
                    {isAdmin ? (
                      <td className={`${td} text-right`}>
                        {p.status === 'completed' ? (
                          <Button size="sm" onClick={() => void approve(p)} disabled={busy === `approve-${p.employeeId}`}>
                            {busy === `approve-${p.employeeId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Approve
                          </Button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {filtered.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 5} className="px-3 py-6 text-center text-muted-foreground">No people match the filters.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
