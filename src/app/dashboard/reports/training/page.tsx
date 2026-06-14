// /dashboard/reports/training — the canonical, world-class training completion
// report (hr+). One screen for the Admin story: "view and export training
// completion for all volunteers, for the Board, and identify follow-ups."
//
//   • Gate: hr+ only (hasMinRole). Volunteers get a tidy 403, not a redirect.
//   • Source of truth: GET /api/reports/training -> { data: { rows, summary } }.
//     The server applies the user/department/module/status filters AND computes
//     the summary, so the stat cards, charts, table and every export agree exactly.
//   • Filter options (facets) come from a one-time unfiltered fetch so the
//     dropdowns never collapse as you narrow the view.
//   • CSV / Excel export re-hits the same endpoint WITH the active filters.
//
// Styling matches the document library + register: max-w-6xl shell, Card/Button/
// Badge primitives, the shared ProgressBar, lucide icons, neutral tokens, Recharts
// for the visuals, and real loading / empty / error / forbidden states. No
// DashboardLayout, no gradients.

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { useAuthStore } from '@/stores/auth'
import { hasMinRole } from '@/types/roles'
import { ProgressBar } from '@/components/training/progress-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  CheckCircle2,
  Clock,
  CircleDashed,
  Gauge,
  GraduationCap,
  Download,
  FileSpreadsheet,
  Search,
  Filter,
  Ban,
  AlertCircle,
  Loader2,
  RotateCcw,
  Award,
} from 'lucide-react'

/* ----------------------------------- types --------------------------------- */

interface Row {
  employee_id: string
  employee_name: string
  employee_no: string | null
  department: string | null
  module_id: string | null
  module_title: string | null
  status: string
  progress_pct: number | null
  completed_at: string | null
  last_activity: string | null
  quiz_score: number | null
  quiz_passed: boolean | null
}

interface ModuleSummary {
  module_id: string | null
  module_title: string
  total: number
  completed: number
  in_progress: number
  not_started: number
  avg_completion: number
}

interface Summary {
  total: number
  completed: number
  in_progress: number
  not_started: number
  volunteers: number
  modules: number
  avg_completion: number
  by_module: ModuleSummary[]
}

interface ReportPayload {
  rows: Row[]
  summary: Summary
}

interface Filters {
  department: string
  moduleId: string
  status: string
  /** Client-only free-text match on volunteer name / id. */
  q: string
}

const EMPTY_FILTERS: Filters = { department: '', moduleId: '', status: '', q: '' }

type LoadState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error' }
  | { kind: 'ready'; data: ReportPayload }

/* ----------------------------------- data ---------------------------------- */

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Server filters only (q is applied client-side). */
function serverQuery(f: Pick<Filters, 'department' | 'moduleId' | 'status'>): string {
  const p = new URLSearchParams()
  if (f.department) p.set('department', f.department)
  if (f.moduleId) p.set('moduleId', f.moduleId)
  if (f.status) p.set('status', f.status)
  return p.toString()
}

/* --------------------------------- palette --------------------------------- */

const STATUS_META = {
  complete: { label: 'Completed', color: '#16a34a', chip: 'text-green-700' },
  in_progress: { label: 'In progress', color: '#d97706', chip: 'text-amber-700' },
  not_started: { label: 'Not started', color: '#94a3b8', chip: 'text-slate-500' },
} as const

type StatusKey = keyof typeof STATUS_META

function statusKey(status: string): StatusKey {
  return status === 'complete' || status === 'in_progress' ? status : 'not_started'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ----------------------------------- page ---------------------------------- */

export default function TrainingReportPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [facets, setFacets] = useState<{ departments: string[]; modules: { id: string; title: string }[] }>({
    departments: [],
    modules: [],
  })
  const [exporting, setExporting] = useState<null | 'csv' | 'xlsx'>(null)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const isStaff = !!user && hasMinRole(user.role, 'hr')

  // One-time unfiltered fetch to populate the filter dropdowns (facets), so the
  // option lists stay stable while the user narrows the report.
  const loadFacets = useCallback(async () => {
    const res = await fetch('/api/reports/training', { headers: authHeaders() })
    if (!res.ok) return
    const json = (await res.json()) as { data: ReportPayload }
    const rows = json.data?.rows ?? []
    const departments = Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[]
    departments.sort((a, b) => a.localeCompare(b))
    const moduleMap = new Map<string, string>()
    for (const r of rows) {
      if (r.module_id) moduleMap.set(r.module_id, r.module_title ?? r.module_id)
    }
    const modules = Array.from(moduleMap.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title))
    setFacets({ departments, modules })
  }, [])

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const qs = serverQuery(filters)
    const res = await fetch(`/api/reports/training${qs ? `?${qs}` : ''}`, { headers: authHeaders() })
    if (!res.ok) {
      if (res.status === 403) return setState({ kind: 'forbidden' })
      return setState({ kind: 'error' })
    }
    const json = (await res.json()) as { data: ReportPayload }
    setState({ kind: 'ready', data: json.data })
  }, [filters])

  useEffect(() => {
    if (isAuthenticated && user && isStaff) {
      void loadFacets()
    }
  }, [isAuthenticated, user, isStaff, loadFacets])

  useEffect(() => {
    if (isAuthenticated && user && isStaff) {
      void load()
    }
  }, [isAuthenticated, user, isStaff, load])

  const exportFile = async (format: 'csv' | 'xlsx') => {
    setExporting(format)
    try {
      const p = new URLSearchParams(serverQuery(filters))
      p.set('format', format)
      p.set('labels', JSON.stringify({ employee: 'Volunteer', department: 'Org Unit' }))
      const res = await fetch(`/api/reports/training?${p.toString()}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="([^"]+)"/.exec(disposition)
      const filename = match ? match[1] : `training-report.${format === 'xlsx' ? 'xls' : 'csv'}`
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch {
      // Non-fatal — keep the page usable; the button simply resets.
    } finally {
      setExporting(null)
    }
  }

  /* ------------------------------- gate states ------------------------------ */

  if (!isAuthenticated || !user) {
    return (
      <Shell>
        <LoadingCard label="Loading…" />
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
            You do not have access to the training report.
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === 'loading') {
    return (
      <Shell>
        <Header />
        <LoadingCard label="Loading training report…" />
      </Shell>
    )
  }

  if (state.kind === 'forbidden') {
    return (
      <Shell>
        <Header />
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Ban className="h-10 w-10 opacity-30" />
            You do not have access to the training report.
          </CardContent>
        </Card>
      </Shell>
    )
  }

  if (state.kind === 'error') {
    return (
      <Shell>
        <Header />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-10 w-10 opacity-30" />
            Could not load the training report.
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  /* --------------------------------- ready ---------------------------------- */

  return (
    <Shell>
      <Header onExport={exportFile} exporting={exporting} hasRows={state.data.rows.length > 0} />
      <ReportBody
        data={state.data}
        filters={filters}
        setFilters={setFilters}
        facets={facets}
      />
    </Shell>
  )
}

/* --------------------------------- sections -------------------------------- */

function ReportBody({
  data,
  filters,
  setFilters,
  facets,
}: {
  data: ReportPayload
  filters: Filters
  setFilters: (f: Filters) => void
  facets: { departments: string[]; modules: { id: string; title: string }[] }
}) {
  const { summary } = data

  // The free-text query is applied client-side on top of the server-filtered rows.
  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const base = q
      ? data.rows.filter(
          (r) =>
            r.employee_name.toLowerCase().includes(q) ||
            (r.employee_no ?? '').toLowerCase().includes(q),
        )
      : data.rows
    // Action-oriented order: not started, then in progress, then complete; name asc.
    const rank: Record<string, number> = { not_started: 0, in_progress: 1, complete: 2 }
    return [...base].sort((a, b) => {
      const ra = rank[a.status] ?? 0
      const rb = rank[b.status] ?? 0
      if (ra !== rb) return ra - rb
      const n = a.employee_name.localeCompare(b.employee_name)
      if (n !== 0) return n
      return (a.module_title ?? '').localeCompare(b.module_title ?? '')
    })
  }, [data.rows, filters.q])

  const showQuiz = useMemo(() => data.rows.some((r) => r.quiz_score != null), [data.rows])

  const statusData = useMemo(
    () =>
      (['complete', 'in_progress', 'not_started'] as StatusKey[])
        .map((k) => ({ key: k, name: STATUS_META[k].label, value: summary[k === 'complete' ? 'completed' : k], color: STATUS_META[k].color }))
        .filter((d) => d.value > 0),
    [summary],
  )

  const moduleData = useMemo(
    () =>
      summary.by_module.map((m) => ({
        name: m.module_title,
        Completed: m.completed,
        'In progress': m.in_progress,
        'Not started': m.not_started,
      })),
    [summary.by_module],
  )

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Users} label="Volunteers" value={summary.volunteers} hint={`${summary.total} assignments`} />
        <StatCard icon={CheckCircle2} label="Completed" value={summary.completed} tone="green" />
        <StatCard icon={Clock} label="In progress" value={summary.in_progress} tone="amber" />
        <StatCard icon={CircleDashed} label="Not started" value={summary.not_started} tone="slate" />
        <StatCard icon={Gauge} label="Avg completion" value={`${summary.avg_completion}%`} tone="primary" />
      </div>

      {/* Visuals */}
      {summary.total > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4 text-muted-foreground" /> Status distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {statusData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={24}
                      iconType="circle"
                      formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-4 w-4 text-muted-foreground" /> Completion by module
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moduleData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" className="opacity-40" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }}
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={24}
                      iconType="circle"
                      formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>}
                    />
                    <Bar dataKey="Completed" stackId="a" fill={STATUS_META.complete.color} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="In progress" stackId="a" fill={STATUS_META.in_progress.color} />
                    <Bar dataKey="Not started" stackId="a" fill={STATUS_META.not_started.color} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Filters */}
      <FilterBar filters={filters} setFilters={setFilters} facets={facets} resultCount={rows.length} />

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
              <GraduationCap className="h-10 w-10 opacity-30" />
              {data.rows.length === 0
                ? 'No training progress has been recorded yet.'
                : 'No rows match these filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Volunteer</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Org unit</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Module</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Progress</th>
                    {showQuiz ? (
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Quiz</th>
                    ) : null}
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const sk = statusKey(r.status)
                    const meta = STATUS_META[sk]
                    return (
                      <tr
                        key={`${r.employee_id}-${r.module_id}-${i}`}
                        className="border-b last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{r.employee_name}</p>
                          {r.employee_no ? (
                            <p className="text-xs text-muted-foreground">{r.employee_no}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.department || '—'}</td>
                        <td className="px-4 py-3 text-foreground">{r.module_title ?? r.module_id ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.chip}`}>
                            <StatusDot status={sk} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-40 max-w-[40vw]">
                            <ProgressBar percent={r.progress_pct ?? 0} />
                          </div>
                        </td>
                        {showQuiz ? (
                          <td className="px-4 py-3">
                            {r.quiz_score != null ? (
                              <Badge
                                variant="outline"
                                className={`gap-1 ${r.quiz_passed === false ? 'text-amber-700' : 'text-green-700'}`}
                              >
                                <Award className="h-3.5 w-3.5" />
                                {r.quiz_score}
                                {r.quiz_passed != null ? (r.quiz_passed ? ' · Pass' : ' · Fail') : ''}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(r.last_activity)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function FilterBar({
  filters,
  setFilters,
  facets,
  resultCount,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  facets: { departments: string[]; modules: { id: string; title: string }[] }
  resultCount: number
}) {
  const ALL = '__all__'
  const active =
    filters.department !== '' || filters.moduleId !== '' || filters.status !== '' || filters.q !== ''

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search volunteer or ID…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <Select
        value={filters.department || ALL}
        onValueChange={(v) => setFilters({ ...filters, department: v === ALL ? '' : v })}
      >
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue placeholder="All org units" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All org units</SelectItem>
          {facets.departments.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.moduleId || ALL}
        onValueChange={(v) => setFilters({ ...filters, moduleId: v === ALL ? '' : v })}
      >
        <SelectTrigger className="h-9 w-[190px]">
          <SelectValue placeholder="All modules" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All modules</SelectItem>
          {facets.modules.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status || ALL}
        onValueChange={(v) => setFilters({ ...filters, status: v === ALL ? '' : v })}
      >
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          <SelectItem value="complete">Completed</SelectItem>
          <SelectItem value="in_progress">In progress</SelectItem>
          <SelectItem value="not_started">Not started</SelectItem>
        </SelectContent>
      </Select>

      <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        {resultCount} {resultCount === 1 ? 'row' : 'rows'}
      </span>

      {active ? (
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setFilters(EMPTY_FILTERS)}>
          <RotateCcw className="h-4 w-4" /> Clear
        </Button>
      ) : null}
    </div>
  )
}

/* -------------------------------- chrome bits ------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl space-y-6 p-6">{children}</div>
}

function Header({
  onExport,
  exporting,
  hasRows,
}: {
  onExport?: (format: 'csv' | 'xlsx') => void
  exporting?: null | 'csv' | 'xlsx'
  hasRows?: boolean
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Training Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Volunteer training completion across all modules — filter, review follow-ups, and export for the Board.
        </p>
      </div>
      {onExport ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!hasRows || exporting !== null} onClick={() => onExport('csv')}>
            {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!hasRows || exporting !== null} onClick={() => onExport('xlsx')}>
            {exporting === 'xlsx' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Excel
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function LoadingCard({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {label}
      </CardContent>
    </Card>
  )
}

const TONE: Record<string, { wrap: string; icon: string; value: string }> = {
  default: { wrap: 'bg-muted', icon: 'text-muted-foreground', value: 'text-foreground' },
  green: { wrap: 'bg-green-100', icon: 'text-green-700', value: 'text-foreground' },
  amber: { wrap: 'bg-amber-100', icon: 'text-amber-700', value: 'text-foreground' },
  slate: { wrap: 'bg-slate-100', icon: 'text-slate-600', value: 'text-foreground' },
  primary: { wrap: 'bg-primary/10', icon: 'text-primary', value: 'text-foreground' },
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  tone?: keyof typeof TONE | string
}) {
  const t = TONE[tone] ?? TONE.default
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-3 px-4 py-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.wrap}`}>
          <Icon className={`h-5 w-5 ${t.icon}`} />
        </div>
        <div className="min-w-0">
          <p className={`text-2xl font-semibold leading-tight ${t.value}`}>{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          {hint ? <p className="truncate text-[11px] text-muted-foreground/80">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusDot({ status }: { status: StatusKey }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_META[status].color }} />
}
