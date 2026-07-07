// src/app/dashboard/training/page.tsx
//
// Volunteer learning view: the modules assigned to me, each with a progress bar
// and status chip, plus a surfaced "My learning activity" timeline built from the
// tracking engine's event stream. Opening a module hands off to the ModulePlayer.
// Module-gated on 'training'; the section noun comes from the label resolver
// (training_module).

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/training/progress-bar'
import { ModulePlayer } from '@/components/training/module-player'
import { LearningActivity, formatDuration } from '@/components/training/learning-activity'
import { trainingService } from '@/services/training'
import { useAuthStore } from '@/stores/auth'
import { useLabels } from '@/hooks/use-labels'
import type { AssignedModule, TrainingProgressStatus } from '@/types/training'
import {
  GraduationCap,
  Loader2,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  PlayCircle,
  CalendarClock,
  Clock,
  ListChecks,
  Activity,
  LayoutGrid,
  AlertTriangle,
  Award,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Status chip presentation, keyed by the module's rolled-up progress status.
const STATUS_CHIP: Record<TrainingProgressStatus, { label: string; className: string }> = {
  complete: { label: 'Complete', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  in_progress: { label: 'In progress', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
  not_started: { label: 'Not started', className: '' },
}

function StatusChip({ status }: { status: TrainingProgressStatus }) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.not_started
  return (
    <Badge variant={status === 'not_started' ? 'outline' : 'secondary'} className={chip.className}>
      {chip.label}
    </Badge>
  )
}

// Friendly due-date label; flags anything in the past as overdue.
function dueLabel(due: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null
  const date = new Date(due)
  if (Number.isNaN(date.getTime())) return null
  const overdue = date.getTime() < Date.now()
  const text = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return { text: overdue ? `Overdue — was due ${text}` : `Due ${text}`, overdue }
}

// Total accrued active-view time across a module's items (a surfaced tracking
// signal — time_spent_seconds is captured per item but never shown otherwise).
function moduleTimeSpent(m: AssignedModule): number {
  return m.items.reduce((sum, it) => sum + (it.progress?.time_spent_seconds ?? 0), 0)
}

type View = 'modules' | 'activity'

// Small KPI tile for the summary row.
function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof GraduationCap
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <div className="mt-0.5 shrink-0 rounded-md bg-muted p-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground/80">{hint}</p> : null}
      </div>
    </div>
  )
}

export default function TrainingPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const { t } = useLabels()
  const [modules, setModules] = useState<AssignedModule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<View>('modules')

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Deep-link: ?module=<id> opens that module directly (e.g. from the Compliance
  // Register "Start"/"Continue" action) instead of landing on the list. Read from
  // window.location (client-only) to avoid useSearchParams' static-prerender
  // Suspense requirement on this non-dynamic route.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const target = new URLSearchParams(window.location.search).get('module')
    if (target && modules.some((m) => m.id === target)) setActiveId(target)
  }, [modules])

  useEffect(() => {
    if (isAuthenticated && user) void load()

  }, [isAuthenticated, user])

  const load = async () => {
    try {
      setLoading(true)
      setError(false)
      const data = await trainingService.getAssignedModules()
      setModules(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const sectionTitle = t('training_module', { plural: true })
  const active = modules.find((m) => m.id === activeId) ?? null

  // ISS-006: download a Certificate of Completion for a finished module.
  const downloadCertificate = async (moduleId: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null
      const res = await fetch(`/api/training/modules/${moduleId}/certificate`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'certificate.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download the certificate')
    }
  }

  // ---- Portfolio summary across all assigned modules ----
  const summary = useMemo(() => {
    const total = modules.length
    const completed = modules.filter((m) => m.module_status === 'complete').length
    const inProgress = modules.filter((m) => m.module_status === 'in_progress').length
    const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0

    let requiredRemaining = 0
    let totalSeconds = 0
    let overdue = 0
    for (const m of modules) {
      requiredRemaining += m.items.filter(
        (i) => i.required && i.progress?.status !== 'complete'
      ).length
      totalSeconds += moduleTimeSpent(m)
      const due = dueLabel(m.due_at)
      if (due?.overdue && m.module_status !== 'complete') overdue += 1
    }
    return { total, completed, inProgress, overallPct, requiredRemaining, totalSeconds, overdue }
  }, [modules])

  const showSummaryBadge = !active && !loading && !error && summary.total > 0

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{sectionTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your assigned learning — work through each module to stay compliant and confident. Your
            progress is tracked automatically.
          </p>
        </div>
        {showSummaryBadge ? (
          <Badge
            variant={summary.completed === summary.total ? 'secondary' : 'outline'}
            className={
              summary.completed === summary.total
                ? 'bg-green-100 text-green-800 hover:bg-green-100'
                : ''
            }
          >
            {summary.completed === summary.total ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> All complete
              </>
            ) : (
              `${summary.completed} of ${summary.total} complete`
            )}
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your {sectionTitle.toLowerCase()}…
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center" role="alert">
            <AlertCircle className="h-10 w-10 text-destructive/70" />
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t load your {sectionTitle.toLowerCase()}.
            </p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : active ? (
        // ---- Single module view ----
        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => setActiveId(null)}>
            <ArrowLeft className="h-4 w-4" /> Back to all
          </Button>
          <ModulePlayer module={active} onProgress={load} />
        </div>
      ) : summary.total === 0 ? (
        // ---- Empty state ----
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <GraduationCap className="h-10 w-10 opacity-30" />
            <p className="font-medium text-foreground">Nothing assigned yet</p>
            <p>When training is assigned to you, it will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        // ---- Module list + activity ----
        <div className="space-y-6">
          {/* Overall progress + KPI tiles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-4 w-4 text-muted-foreground" /> Overall progress
              </CardTitle>
              <CardDescription>
                {summary.completed === summary.total
                  ? 'You have completed all assigned modules. Nicely done.'
                  : `${summary.total - summary.completed} module${
                      summary.total - summary.completed === 1 ? '' : 's'
                    } still need your attention.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressBar percent={summary.overallPct} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  icon={CheckCircle2}
                  label="Modules complete"
                  value={`${summary.completed}/${summary.total}`}
                  hint={summary.inProgress > 0 ? `${summary.inProgress} in progress` : undefined}
                />
                <Stat
                  icon={ListChecks}
                  label="Required items left"
                  value={String(summary.requiredRemaining)}
                  hint={summary.requiredRemaining === 0 ? 'All done' : undefined}
                />
                <Stat
                  icon={Clock}
                  label="Time spent learning"
                  value={summary.totalSeconds > 0 ? formatDuration(summary.totalSeconds) : '—'}
                />
                <Stat
                  icon={AlertTriangle}
                  label="Overdue"
                  value={String(summary.overdue)}
                  hint={summary.overdue === 0 ? 'On track' : undefined}
                />
              </div>
            </CardContent>
          </Card>

          {/* View toggle: modules grid vs. surfaced activity timeline */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
            <Button
              variant={view === 'modules' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5"
              onClick={() => setView('modules')}
              aria-pressed={view === 'modules'}
            >
              <LayoutGrid className="h-4 w-4" /> My {sectionTitle.toLowerCase()}
            </Button>
            <Button
              variant={view === 'activity' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5"
              onClick={() => setView('activity')}
              aria-pressed={view === 'activity'}
            >
              <Activity className="h-4 w-4" /> My learning activity
            </Button>
          </div>

          {view === 'activity' ? (
            <LearningActivity modules={modules} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {modules.map((m) => {
                const requiredRemaining = m.items.filter(
                  (i) => i.required && i.progress?.status !== 'complete'
                ).length
                const isComplete = m.module_status === 'complete'
                const due = dueLabel(m.due_at)
                const spent = moduleTimeSpent(m)
                const itemsDone = m.items.filter((i) => i.progress?.status === 'complete').length

                return (
                  <Card key={m.id} className="flex flex-col transition-shadow hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug">{m.title}</CardTitle>
                        <StatusChip status={m.module_status} />
                      </div>
                      {m.description ? (
                        <CardDescription className="line-clamp-2">{m.description}</CardDescription>
                      ) : null}
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col gap-3">
                      <ProgressBar percent={m.percent_complete} />

                      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <ListChecks className="h-3.5 w-3.5" />
                          {itemsDone} of {m.items.length} item{m.items.length === 1 ? '' : 's'} done
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          {requiredRemaining === 0 ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              All required items done
                            </>
                          ) : (
                            <>
                              <PlayCircle className="h-3.5 w-3.5" />
                              {requiredRemaining} required item{requiredRemaining === 1 ? '' : 's'} remaining
                            </>
                          )}
                        </span>
                        {spent > 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDuration(spent)} spent
                          </span>
                        ) : null}
                        {due ? (
                          <span
                            className={`inline-flex items-center gap-1.5 ${
                              due.overdue && !isComplete ? 'text-destructive' : ''
                            }`}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            {due.text}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-auto space-y-2">
                        <Button
                          className="w-full"
                          variant={isComplete ? 'outline' : 'default'}
                          onClick={() => setActiveId(m.id)}
                        >
                          {isComplete ? 'Review' : m.module_status === 'not_started' ? 'Start' : 'Continue'}
                        </Button>
                        {isComplete ? (
                          <Button variant="ghost" className="w-full text-primary" onClick={() => void downloadCertificate(m.id)}>
                            <Award className="h-4 w-4" /> Download certificate
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
