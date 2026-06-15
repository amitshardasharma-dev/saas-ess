// /dashboard/recertification — Admin recertification dashboard (hr+).
//
// A world-class operations view for the Phase 7 recertification engine: when a
// certification expires the engine opens a recert cycle, assigns the mapped
// refresher module, and closes the cycle when the module is finished. This page
// surfaces those cycles for Staff/Admin:
//
//   • Summary cards: Assigned / In progress / Completed / Overdue counts.
//   • Filterable, action-first table of cycles: volunteer, certification type,
//     assigned refresher module, status chip, opened date, completed / expiry.
//   • Per-cycle history timeline (ess_recert_history) on demand.
//   • "Run recertification scan" — enqueues the existing POST job and explains it
//     runs on the next cron tick.
//   • A link to the Board compliance report (which already includes recert state).
//   • hr+ gate with a tidy 403 for volunteers (no redirect).
//
// Styling matches the document register/library: max-w-5xl shell, Card/Button/
// Badge primitives, ProgressBar, lucide icons, neutral tokens, real loading /
// empty / error / forbidden states. No DashboardLayout, no gradients.

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole } from '@/types/roles'
import { ProgressBar } from '@/components/training/progress-bar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCcw,
  ShieldCheck,
  Ban,
  AlertCircle,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Clock,
  PlayCircle,
  ClipboardList,
  GraduationCap,
  CalendarClock,
  History,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  BarChart3,
  Inbox,
} from 'lucide-react'

/* ----------------------------------- data ---------------------------------- */

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface RecertHistoryEvent {
  id: string
  event: string
  detail: string | null
  created_at: string | null
}

interface Recert {
  id: string
  employee_id: string
  certification_id: string
  status: string
  triggered_at: string
  assigned_module_id: string | null
  completed_at: string | null
  employee_name: string | null
  employee_no: string | null
  department: string | null
  cert_type: string | null
  cert_expiry_date: string | null
  module_title: string | null
  history: RecertHistoryEvent[]
}

type StatusFilter = 'all' | 'assigned' | 'in_progress' | 'completed' | 'overdue'
type SortKey = 'priority' | 'opened' | 'volunteer'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ready'; items: Recert[] }

/** Cycles open longer than this (days) without completing are flagged overdue. */
const OVERDUE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

const isOpen = (r: Recert) => r.status === 'assigned' || r.status === 'in_progress'

/** Days a still-open cycle has been open; null for completed cycles / bad dates. */
function ageDays(r: Recert, now: number): number | null {
  if (!isOpen(r) || !r.triggered_at) return null
  const t = new Date(r.triggered_at).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((now - t) / DAY_MS)
}

const isOverdue = (r: Recert, now: number): boolean => {
  const age = ageDays(r, now)
  return age !== null && age >= OVERDUE_DAYS
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/* ----------------------------------- page ---------------------------------- */

export default function RecertificationPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortKey>('priority')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scanState, setScanState] = useState<'idle' | 'running' | 'queued' | 'error'>('idle')

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const isStaff = !!user && hasMinRole(user.role, 'hr')

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/recertification', { headers: authHeaders() })
      if (res.status === 401 || res.status === 403) return setState({ kind: 'forbidden' })
      if (!res.ok) return setState({ kind: 'error' })
      const json = (await res.json()) as { data: Recert[] }
      setState({ kind: 'ready', items: json.data ?? [] })
    } catch {
      setState({ kind: 'error' })
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && user && isStaff) void load()
  }, [isAuthenticated, user, isStaff, load])

  const runScan = useCallback(async () => {
    setScanState('running')
    try {
      const res = await fetch('/api/recertification', { method: 'POST', headers: authHeaders() })
      if (!res.ok) return setScanState('error')
      setScanState('queued')
    } catch {
      setScanState('error')
    }
  }, [])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /* ------------------------------- gate states ------------------------------ */

  if (!isAuthenticated || !user) {
    return (
      <Shell>
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (!isStaff) {
    return (
      <Shell>
        <Header />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Ban className="h-10 w-10 opacity-30" />
            You do not have access to the recertification dashboard.
          </CardContent>
        </Card>
      </Shell>
    )
  }

  /* --------------------------------- header --------------------------------- */

  const now = Date.now()
  const items = state.kind === 'ready' ? state.items : []

  const counts = {
    assigned: items.filter((r) => r.status === 'assigned').length,
    in_progress: items.filter((r) => r.status === 'in_progress').length,
    completed: items.filter((r) => r.status === 'completed').length,
    overdue: items.filter((r) => isOverdue(r, now)).length,
  }
  const total = items.length
  const completionPct = total > 0 ? (counts.completed / total) * 100 : 0

  const filtered = items.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'overdue') return isOverdue(r, now)
    return r.status === filter
  })

  // Action-first ordering: overdue cycles bubble to the top, then open by age,
  // then completed by most-recently-completed.
  const rankFor = (r: Recert): number => {
    if (isOverdue(r, now)) return 0
    if (r.status === 'assigned' || r.status === 'in_progress') return 1
    return 2
  }
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'priority') {
      const ra = rankFor(a)
      const rb = rankFor(b)
      if (ra !== rb) return ra - rb
      // within the same band, oldest-open first / newest-completed first
      const ageB = ageDays(b, now) ?? -1
      const ageA = ageDays(a, now) ?? -1
      if (ageA !== ageB && (a.status !== 'completed' || b.status !== 'completed')) return ageB - ageA
      return (b.completed_at ?? b.triggered_at ?? '').localeCompare(a.completed_at ?? a.triggered_at ?? '')
    }
    if (sort === 'opened') return (b.triggered_at ?? '').localeCompare(a.triggered_at ?? '')
    // volunteer
    return (a.employee_name ?? '~').localeCompare(b.employee_name ?? '~')
  })

  return (
    <Shell>
      <Header
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/dashboard/reports/compliance">
                <BarChart3 className="h-4 w-4" /> Compliance report
              </Link>
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={runScan}
              disabled={scanState === 'running'}
            >
              {scanState === 'running' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Run recertification scan
            </Button>
          </div>
        }
      />

      {/* Scan feedback */}
      {scanState === 'queued' ? (
        <Card className="border-green-200 bg-green-50/60">
          <CardContent className="flex items-start gap-2.5 py-3.5 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Scan queued — it runs on the next cron tick. New recertifications will
              appear here once the job completes.{' '}
              <button onClick={() => void load()} className="font-medium underline underline-offset-2">
                Refresh
              </button>
            </span>
          </CardContent>
        </Card>
      ) : scanState === 'error' ? (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="flex items-start gap-2.5 py-3.5 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Could not enqueue the scan. Please try again.
          </CardContent>
        </Card>
      ) : null}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Assigned"
          value={counts.assigned}
          icon={<ClipboardList className="h-4 w-4" />}
          tone="neutral"
        />
        <StatCard
          label="In progress"
          value={counts.in_progress}
          icon={<PlayCircle className="h-4 w-4" />}
          tone="blue"
        />
        <StatCard
          label="Completed"
          value={counts.completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="green"
        />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={counts.overdue > 0 ? 'amber' : 'neutral'}
          hint={`open ${OVERDUE_DAYS}d+`}
        />
      </div>

      {/* Completion progress */}
      {state.kind === 'ready' && total > 0 ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-end justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="text-xl font-semibold text-foreground">{counts.completed}</span>
                <span className="mx-1">of</span>
                <span className="font-medium text-foreground">{total}</span> cycle
                {total === 1 ? '' : 's'} completed
              </p>
              {counts.overdue > 0 ? (
                <Badge variant="outline" className="gap-1 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> {counts.overdue} overdue
                </Badge>
              ) : counts.assigned + counts.in_progress > 0 ? (
                <Badge variant="outline" className="gap-1 text-blue-700">
                  <Clock className="h-3.5 w-3.5" /> {counts.assigned + counts.in_progress} open
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All clear
                </Badge>
              )}
            </div>
            <ProgressBar percent={completionPct} />
          </CardContent>
        </Card>
      ) : null}

      {/* Filters + sort */}
      {state.kind === 'ready' && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              All <span className="opacity-60">{total}</span>
            </FilterChip>
            <FilterChip active={filter === 'assigned'} onClick={() => setFilter('assigned')}>
              Assigned <span className="opacity-60">{counts.assigned}</span>
            </FilterChip>
            <FilterChip active={filter === 'in_progress'} onClick={() => setFilter('in_progress')}>
              In progress <span className="opacity-60">{counts.in_progress}</span>
            </FilterChip>
            <FilterChip active={filter === 'completed'} onClick={() => setFilter('completed')}>
              Completed <span className="opacity-60">{counts.completed}</span>
            </FilterChip>
            <FilterChip
              active={filter === 'overdue'}
              onClick={() => setFilter('overdue')}
              tone="amber"
            >
              Overdue <span className="opacity-60">{counts.overdue}</span>
            </FilterChip>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() =>
              setSort((s) => (s === 'priority' ? 'opened' : s === 'opened' ? 'volunteer' : 'priority'))
            }
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sort === 'priority' ? 'Action first' : sort === 'opened' ? 'Newest opened' : 'Volunteer A–Z'}
          </Button>
        </div>
      ) : null}

      {/* Body */}
      {state.kind === 'loading' ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading recertifications…
          </CardContent>
        </Card>
      ) : state.kind === 'error' ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 opacity-30" />
            Could not load recertifications.
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <ShieldCheck className="h-10 w-10 opacity-30" />
            <p className="font-medium text-foreground">No recertifications yet</p>
            <p className="max-w-md">
              When a certification expires, the engine opens a recertification cycle and
              assigns the refresher module here. Run a scan to check for expired
              certifications now.
            </p>
          </CardContent>
        </Card>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Inbox className="h-9 w-9 opacity-30" />
            No cycles match this filter.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Column header (md+) */}
          <div className="hidden grid-cols-[1.4fr_1.1fr_1.1fr_0.9fr_0.9fr_2rem] gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
            <span>Volunteer</span>
            <span>Certification</span>
            <span>Refresher module</span>
            <span>Status</span>
            <span>Opened / Closed</span>
            <span />
          </div>
          <ul className="divide-y">
            {sorted.map((r) => (
              <RecertRow
                key={r.id}
                recert={r}
                now={now}
                expanded={expanded.has(r.id)}
                onToggle={() => toggle(r.id)}
              />
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  )
}

/* --------------------------------- row ------------------------------------- */

function RecertRow({
  recert: r,
  now,
  expanded,
  onToggle,
}: {
  recert: Recert
  now: number
  expanded: boolean
  onToggle: () => void
}) {
  const overdue = isOverdue(r, now)
  const age = ageDays(r, now)
  const hasHistory = r.history.length > 0

  return (
    <li className={overdue ? 'bg-amber-50/40' : undefined}>
      <div className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1.4fr_1.1fr_1.1fr_0.9fr_0.9fr_2rem] md:items-center md:gap-3">
        {/* Volunteer */}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {r.employee_name ?? 'Unknown volunteer'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[r.employee_no, r.department].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>

        {/* Certification */}
        <div className="min-w-0 text-sm">
          <span className="md:hidden text-xs text-muted-foreground">Certification: </span>
          <span className="truncate text-foreground">{r.cert_type ?? 'Certification'}</span>
          {r.cert_expiry_date ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> expired {fmtDate(r.cert_expiry_date)}
            </p>
          ) : null}
        </div>

        {/* Module */}
        <div className="min-w-0 text-sm">
          <span className="md:hidden text-xs text-muted-foreground">Refresher: </span>
          {r.module_title ? (
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <GraduationCap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{r.module_title}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">No module mapped</span>
          )}
        </div>

        {/* Status */}
        <div>
          <StatusChip status={r.status} overdue={overdue} ageDays={age} />
        </div>

        {/* Dates */}
        <div className="text-sm">
          <p className="text-foreground">{fmtDate(r.triggered_at)}</p>
          <p className="text-xs text-muted-foreground">
            {r.status === 'completed'
              ? `done ${fmtDate(r.completed_at)}`
              : age !== null
                ? `open ${age}d`
                : 'open'}
          </p>
        </div>

        {/* Expander */}
        <div className="flex justify-start md:justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onToggle}
            disabled={!hasHistory}
            title={hasHistory ? 'View history' : 'No history recorded'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* History timeline */}
      {expanded && hasHistory ? (
        <div className="border-t bg-muted/20 px-4 py-3 md:pl-6">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Cycle history
          </p>
          <ol className="space-y-2.5 border-l border-border pl-4">
            {r.history.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[1.3125rem] top-1 h-2 w-2 rounded-full bg-primary/60 ring-2 ring-background" />
                <p className="text-sm font-medium text-foreground">{eventLabel(h.event)}</p>
                {h.detail ? <p className="text-xs text-muted-foreground">{h.detail}</p> : null}
                <p className="text-[11px] text-muted-foreground">{fmtDateTime(h.created_at)}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </li>
  )
}

/* -------------------------------- chrome bits ------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl space-y-6 p-6">{children}</div>
}

function Header({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Recertification</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track recertification cycles for expired certifications and their refresher training.
          </p>
        </div>
      </div>
      {action}
    </div>
  )
}

type Tone = 'neutral' | 'blue' | 'green' | 'amber'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-foreground',
  blue: 'text-blue-700',
  green: 'text-green-700',
  amber: 'text-amber-700',
}
const TONE_ICON_BG: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
}

function StatCard({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: Tone
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_ICON_BG[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className={`text-2xl font-semibold leading-none ${TONE_TEXT[tone]}`}>{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {label}
            {hint ? <span className="ml-1 opacity-60">({hint})</span> : null}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function FilterChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean
  onClick: () => void
  tone?: 'amber'
  children: React.ReactNode
}) {
  const activeCls =
    tone === 'amber' ? 'bg-amber-600 text-white hover:bg-amber-600' : 'bg-primary text-primary-foreground'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active ? activeCls : 'border-border bg-background text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

function StatusChip({
  status,
  overdue,
  ageDays: age,
}: {
  status: string
  overdue: boolean
  ageDays: number | null
}) {
  if (overdue) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5" />
        Overdue{age !== null ? ` · ${age}d` : ''}
      </Badge>
    )
  }
  if (status === 'completed') {
    return (
      <Badge variant="outline" className="gap-1 text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Completed
      </Badge>
    )
  }
  if (status === 'in_progress') {
    return (
      <Badge variant="outline" className="gap-1 text-blue-700">
        <PlayCircle className="h-3.5 w-3.5" /> In progress
      </Badge>
    )
  }
  if (status === 'assigned') {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Clock className="h-3.5 w-3.5" /> Assigned
      </Badge>
    )
  }
  return <Badge variant="outline">{status || '—'}</Badge>
}

/** Humanize ess_recert_history.event values (created / module_assigned / completed). */
function eventLabel(event: string): string {
  switch (event) {
    case 'created':
      return 'Recertification opened'
    case 'module_assigned':
      return 'Refresher module assigned'
    case 'completed':
      return 'Recertification completed'
    default:
      return event
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase())
  }
}
