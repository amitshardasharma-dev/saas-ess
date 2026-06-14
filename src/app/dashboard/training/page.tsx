// src/app/dashboard/training/page.tsx
//
// Volunteer learning view: the modules assigned to me, each with a progress bar
// and status chip. Opening a module hands off to the ModulePlayer. Module-gated
// on 'training'; the section noun comes from the label resolver (training_module).

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/training/progress-bar'
import { ModulePlayer } from '@/components/training/module-player'
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
} from 'lucide-react'

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

export default function TrainingPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const { t } = useLabels()
  const [modules, setModules] = useState<AssignedModule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

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

  // Portfolio summary across all assigned modules (hidden while a module is open).
  const total = modules.length
  const completed = modules.filter((m) => m.module_status === 'complete').length
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{sectionTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your assigned learning — work through each module to stay compliant and confident.
          </p>
        </div>
        {!active && !loading && !error && total > 0 ? (
          <Badge
            variant={completed === total ? 'secondary' : 'outline'}
            className={completed === total ? 'bg-green-100 text-green-800 hover:bg-green-100' : ''}
          >
            {completed === total ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> All complete
              </>
            ) : (
              `${completed} of ${total} complete`
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
      ) : total === 0 ? (
        // ---- Empty state ----
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <GraduationCap className="h-10 w-10 opacity-30" />
            <p className="font-medium text-foreground">Nothing assigned yet</p>
            <p>When training is assigned to you, it will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        // ---- Module list ----
        <div className="space-y-6">
          {/* Overall progress across all modules */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-4 w-4 text-muted-foreground" /> Overall progress
              </CardTitle>
              <CardDescription>
                {completed === total
                  ? 'You have completed all assigned modules. Nicely done.'
                  : `${total - completed} module${total - completed === 1 ? '' : 's'} still need your attention.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProgressBar percent={overallPct} />
            </CardContent>
          </Card>

          {/* Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => {
              const requiredRemaining = m.items.filter(
                (i) => i.required && i.progress?.status !== 'complete'
              ).length
              const isComplete = m.module_status === 'complete'
              const due = dueLabel(m.due_at)

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
                      {due ? (
                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            due.overdue ? 'text-destructive' : ''
                          }`}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          {due.text}
                        </span>
                      ) : null}
                    </div>

                    <Button
                      className="mt-auto w-full"
                      variant={isComplete ? 'outline' : 'default'}
                      onClick={() => setActiveId(m.id)}
                    >
                      {isComplete ? 'Review' : m.module_status === 'not_started' ? 'Start' : 'Continue'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
