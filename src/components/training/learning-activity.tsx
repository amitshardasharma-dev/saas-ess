// src/components/training/learning-activity.tsx
//
// "My learning activity" — a read-only timeline of the volunteer's own training
// events, surfacing tracking data that is captured by the engine but otherwise
// invisible to the learner: completions, quiz attempts (with scores),
// acknowledgements, document downloads, and accrued time.
//
// Source: GET /api/training/events (trainingService.getEvents('my')). The engine
// contracts are not touched — this view only reads. Module/item ids are resolved
// to human titles from the assigned-modules payload the learner already loads.
//
// Noisy 'time_tick' rows (one every ~15s of active view) are rolled up per
// item+day into a single "Spent N on <item>" entry so the timeline stays
// readable while still exposing the underlying time-spent signal.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { trainingService } from '@/services/training'
import type { AssignedModule, TrainingEvent } from '@/types/training'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  GraduationCap,
  Loader2,
  PlayCircle,
  Trophy,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Shared formatting helpers (exported — the module player reuses these so the
// time + date presentation stays identical across the learner surfaces).
// ---------------------------------------------------------------------------

/** "1h 5m", "12m", "45s", or "—" for zero/empty. Compact, human-readable. */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0))
  if (s === 0) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return sec > 0 && m < 5 ? `${m}m ${sec}s` : `${m}m`
  return `${sec}s`
}

/** Absolute date+time, e.g. "14 Jun 2026, 09:42". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "today", "yesterday", "3 days ago", or a date for older entries. */
export function formatRelativeDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** YYYY-MM-DD local key for grouping events by calendar day. */
function dayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Event presentation
// ---------------------------------------------------------------------------

type Tone = 'success' | 'info' | 'muted' | 'warn'

interface ActivityEntry {
  /** Stable key for React. */
  key: string
  /** Most-recent timestamp represented by this entry. */
  at: string
  icon: LucideIcon
  tone: Tone
  title: string
  /** Optional second line (module name / context). */
  context?: string
  /** Optional trailing badge text (e.g. a quiz score). */
  badge?: string
}

const TONE_ICON: Record<Tone, string> = {
  success: 'text-green-600',
  info: 'text-blue-600',
  warn: 'text-amber-600',
  muted: 'text-muted-foreground',
}

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-green-500',
  info: 'bg-blue-500',
  warn: 'bg-amber-500',
  muted: 'bg-muted-foreground/40',
}

function scoreLabel(meta: Record<string, unknown>): string | undefined {
  const score = meta?.score
  if (typeof score === 'number' && Number.isFinite(score)) return `${Math.round(score)}%`
  return undefined
}

/**
 * Collapse the raw event stream into a presentable, deduplicated timeline.
 * - time_tick rows are summed per (item, day) into one "Spent N on X" entry.
 * - everything else maps 1:1 to a labelled entry.
 */
function buildEntries(
  events: TrainingEvent[],
  moduleTitle: (id: string) => string,
  itemTitle: (id: string | null) => string | null
): ActivityEntry[] {
  const entries: ActivityEntry[] = []

  // Roll up time ticks: key = itemId|day -> { seconds, latestAt, moduleId }
  const tickRollup = new Map<
    string,
    { seconds: number; at: string; itemId: string | null; moduleId: string }
  >()

  for (const ev of events) {
    if (ev.event === 'time_tick') {
      const key = `${ev.item_id ?? 'module'}|${dayKey(ev.created_at)}`
      const secs = typeof ev.meta?.seconds === 'number' ? ev.meta.seconds : 0
      const existing = tickRollup.get(key)
      if (existing) {
        existing.seconds += secs
        if (ev.created_at > existing.at) existing.at = ev.created_at
      } else {
        tickRollup.set(key, {
          seconds: secs,
          at: ev.created_at,
          itemId: ev.item_id,
          moduleId: ev.module_id,
        })
      }
      continue
    }

    const item = itemTitle(ev.item_id)
    const mod = moduleTitle(ev.module_id)
    const ctxItem = item ? `${item} · ${mod}` : mod

    switch (ev.event) {
      case 'module_completed':
        entries.push({
          key: ev.id,
          at: ev.created_at,
          icon: Trophy,
          tone: 'success',
          title: 'Completed a module',
          context: mod,
        })
        break
      case 'module_started':
        entries.push({
          key: ev.id,
          at: ev.created_at,
          icon: GraduationCap,
          tone: 'info',
          title: 'Started a module',
          context: mod,
        })
        break
      case 'video_watched':
        entries.push({
          key: ev.id,
          at: ev.created_at,
          icon: PlayCircle,
          tone: 'success',
          title: 'Watched a video',
          context: ctxItem,
        })
        break
      case 'doc_acknowledged':
        entries.push({
          key: ev.id,
          at: ev.created_at,
          icon: CheckCircle2,
          tone: 'success',
          title: 'Read & acknowledged a document',
          context: ctxItem,
        })
        break
      case 'doc_downloaded':
        entries.push({
          key: ev.id,
          at: ev.created_at,
          icon: Download,
          tone: 'muted',
          title: 'Downloaded a document',
          context: ctxItem,
        })
        break
      case 'quiz_passed':
        entries.push({
          key: ev.id,
          at: ev.created_at,
          icon: Trophy,
          tone: 'success',
          title: 'Passed a quiz',
          context: ctxItem,
          badge: scoreLabel(ev.meta),
        })
        break
      case 'quiz_failed':
        entries.push({
          key: ev.id,
          at: ev.created_at,
          icon: XCircle,
          tone: 'warn',
          title: 'Quiz attempt — not passed yet',
          context: ctxItem,
          badge: scoreLabel(ev.meta),
        })
        break
      default:
        entries.push({
          key: ev.id,
          at: ev.created_at,
          icon: Activity,
          tone: 'muted',
          title: ev.event.replace(/_/g, ' '),
          context: ctxItem,
        })
    }
  }

  for (const [key, roll] of tickRollup) {
    if (roll.seconds <= 0) continue
    const item = itemTitle(roll.itemId)
    const mod = moduleTitle(roll.moduleId)
    entries.push({
      key: `tick-${key}`,
      at: roll.at,
      icon: Clock,
      tone: 'muted',
      title: `Spent ${formatDuration(roll.seconds)} learning`,
      context: item ? `${item} · ${mod}` : mod,
    })
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return entries
}

const TYPE_ICON_FALLBACK: LucideIcon = FileText

interface LearningActivityProps {
  /** Pre-loaded assigned modules, used to resolve ids -> titles (no extra fetch). */
  modules: AssignedModule[]
}

export function LearningActivity({ modules }: LearningActivityProps) {
  const [events, setEvents] = useState<TrainingEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // id -> title lookups built from the assigned modules already in memory.
  const { moduleTitleFor, itemTitleFor } = useMemo(() => {
    const modMap = new Map<string, string>()
    const itemMap = new Map<string, string>()
    for (const m of modules) {
      modMap.set(m.id, m.title)
      for (const it of m.items) itemMap.set(it.id, it.title)
    }
    return {
      moduleTitleFor: (id: string) => modMap.get(id) ?? 'A module',
      itemTitleFor: (id: string | null) => (id ? itemMap.get(id) ?? null : null),
    }
  }, [modules])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        setLoading(true)
        setError(false)
        const data = await trainingService.getEvents('my')
        if (!cancelled) setEvents(data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      setError(false)
      setEvents(await trainingService.getEvents('my'))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const entries = useMemo(
    () => buildEntries(events, moduleTitleFor, itemTitleFor),
    [events, moduleTitleFor, itemTitleFor]
  )

  // Group entries under relative-day headers for scannability.
  const groups = useMemo(() => {
    const out: Array<{ label: string; items: ActivityEntry[] }> = []
    let currentKey = ''
    for (const e of entries) {
      const key = dayKey(e.at)
      if (key !== currentKey) {
        out.push({ label: formatRelativeDay(e.at), items: [] })
        currentKey = key
      }
      out[out.length - 1].items.push(e)
    }
    return out
  }, [entries])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-muted-foreground" /> My learning activity
            </CardTitle>
            <CardDescription>
              An automatic record of everything you&apos;ve completed, acknowledged, and attempted.
            </CardDescription>
          </div>
          {!loading && !error && entries.length > 0 ? (
            <Badge variant="outline">
              {entries.length} event{entries.length === 1 ? '' : 's'}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your activity…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
            <AlertCircle className="h-9 w-9 text-destructive/70" />
            <p className="text-sm text-muted-foreground">We couldn&apos;t load your activity.</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Activity className="h-9 w-9 opacity-30" />
            <p className="font-medium text-foreground">No activity yet</p>
            <p>As you work through your training, your progress will be tracked here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group, gi) => (
              <div key={`${group.label}-${gi}`} className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <ol className="relative space-y-3 border-l border-border pl-5">
                  {group.items.map((entry) => {
                    const Icon = entry.icon ?? TYPE_ICON_FALLBACK
                    return (
                      <li key={entry.key} className="relative">
                        {/* Timeline dot */}
                        <span
                          aria-hidden
                          className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background ${
                            TONE_DOT[entry.tone]
                          }`}
                        />
                        <div className="flex items-start gap-3 rounded-md border bg-card px-3 py-2.5">
                          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_ICON[entry.tone]}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <p className="text-sm font-medium text-foreground">{entry.title}</p>
                              {entry.badge ? (
                                <Badge variant="outline" className="text-xs">
                                  {entry.badge}
                                </Badge>
                              ) : null}
                            </div>
                            {entry.context ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {entry.context}
                              </p>
                            ) : null}
                          </div>
                          <time
                            className="shrink-0 text-xs text-muted-foreground"
                            dateTime={entry.at}
                            title={formatDateTime(entry.at)}
                          >
                            {new Date(entry.at).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
