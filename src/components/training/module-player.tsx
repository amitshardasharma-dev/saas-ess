// src/components/training/module-player.tsx
//
// Walks a module's items in order. Renders the active item (video / document /
// quiz), records acknowledgement + time ticks via the training service, and
// reflects per-item completion. Time ticks are throttled client-side to one
// every 15s of active view (server also caps + throttles).

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VideoEmbed } from './video-embed'
import { ProgressBar } from './progress-bar'
import { trainingService } from '@/services/training'
import type { AssignedModule, TrainingItemWithProgress, TrainingItemType } from '@/types/training'
import {
  CheckCircle2,
  Circle,
  FileText,
  PlayCircle,
  HelpCircle,
  Download,
  ChevronLeft,
  ChevronRight,
  Lock,
  type LucideIcon,
} from 'lucide-react'

const TICK_INTERVAL_MS = 15_000
const TICK_SECONDS = 15

interface ModulePlayerProps {
  module: AssignedModule
  onProgress?: () => void
}

const TYPE_META: Record<TrainingItemType, { icon: LucideIcon; label: string }> = {
  video: { icon: PlayCircle, label: 'Video' },
  document: { icon: FileText, label: 'Document' },
  quiz: { icon: HelpCircle, label: 'Quiz' },
}

function typeMeta(type: string) {
  return TYPE_META[type as TrainingItemType] ?? { icon: HelpCircle, label: type }
}

export function ModulePlayer({ module, onProgress }: ModulePlayerProps) {
  const [items, setItems] = useState<TrainingItemWithProgress[]>(module.items)
  const [activeIndex, setActiveIndex] = useState(0)
  const active = items[activeIndex]
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep local item state in sync if the parent reloads the module.
  useEffect(() => {
    setItems(module.items)
  }, [module.items])

  // Throttled time-tick for the active item while it is open and incomplete.
  useEffect(() => {
    if (!active || active.progress?.status === 'complete') return
    tickRef.current = setInterval(() => {
      void trainingService.track(active.id, 'time_tick', TICK_SECONDS)
    }, TICK_INTERVAL_MS)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [active])

  const markComplete = async (
    item: TrainingItemWithProgress,
    event: 'video_watched' | 'doc_acknowledged'
  ) => {
    const progress = await trainingService.track(item.id, event)
    if (progress) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, progress } : i)))
      toast.success('Marked complete')
      onProgress?.()
    } else {
      toast.error('Could not record completion')
    }
  }

  const onDownload = async (item: TrainingItemWithProgress) => {
    await trainingService.track(item.id, 'doc_downloaded')
    if (item.video_url) return // (defensive — documents use document_id, opened by the doc surface)
  }

  const completedCount = items.filter((i) => i.progress?.status === 'complete').length
  const totalCount = items.length

  return (
    <div className="space-y-4">
      {/* Module summary header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-xl">{module.title}</CardTitle>
              {module.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
              ) : null}
            </div>
            <Badge
              variant={module.module_status === 'complete' ? 'secondary' : 'outline'}
              className={
                module.module_status === 'complete'
                  ? 'bg-green-100 text-green-800 hover:bg-green-100'
                  : ''
              }
            >
              {module.module_status === 'complete'
                ? 'Complete'
                : module.module_status === 'in_progress'
                  ? 'In progress'
                  : 'Not started'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ProgressBar percent={module.percent_complete} />
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{completedCount}</span> of {totalCount}{' '}
            item{totalCount === 1 ? '' : 's'} complete
          </p>
        </CardContent>
      </Card>

      {totalCount === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            This module has no items yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          {/* Item list / outline */}
          <nav aria-label="Module items" className="space-y-1">
            {items.map((item, idx) => {
              const isDone = item.progress?.status === 'complete'
              const TypeIcon = typeMeta(item.type).icon
              const isActive = idx === activeIndex
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveIndex(idx)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'border-border bg-muted/60 font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label="Complete" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                  <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.title}</span>
                  {!item.required ? (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground/70">Optional</span>
                  ) : null}
                </button>
              )
            })}
            <p className="px-3 pt-2 text-xs text-muted-foreground">
              {completedCount} / {totalCount} items done
            </p>
          </nav>

          {/* Active item */}
          {active ? (
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const TypeIcon = typeMeta(active.type).icon
                      return <TypeIcon className="h-5 w-5 text-muted-foreground" />
                    })()}
                    <CardTitle className="text-base">{active.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {typeMeta(active.type).label}
                    </Badge>
                    {active.progress?.status === 'complete' ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                      </Badge>
                    ) : !active.required ? (
                      <Badge variant="outline">Optional</Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Video */}
                {active.type === 'video' && active.video_url ? (
                  <>
                    <VideoEmbed url={active.video_url} title={active.title} />
                    <Button
                      disabled={active.progress?.status === 'complete'}
                      onClick={() => markComplete(active, 'video_watched')}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {active.progress?.status === 'complete' ? 'Watched' : "I've watched this"}
                    </Button>
                  </>
                ) : null}

                {/* Document */}
                {active.type === 'document' ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 rounded-lg bg-primary/10 p-2">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Download and read this document, then confirm you&apos;ve read and
                          acknowledged it.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => onDownload(active)}>
                        <Download className="h-4 w-4" /> Download
                      </Button>
                      <Button
                        disabled={active.progress?.status === 'complete'}
                        onClick={() => markComplete(active, 'doc_acknowledged')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {active.progress?.status === 'complete'
                          ? 'Acknowledged'
                          : "I've read & acknowledge"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Quiz */}
                {active.type === 'quiz' ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 rounded-lg bg-primary/10 p-2">
                          <HelpCircle className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Take the quiz to complete this item. Your result is recorded automatically;
                          this item completes when you pass.
                        </p>
                      </div>
                    </div>
                    {active.progress?.status === 'complete' ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                      </Badge>
                    ) : active.quiz_id ? (
                      <Button asChild>
                        <Link href={`/dashboard/training/quiz/${active.quiz_id}?item=${active.id}`}>
                          <HelpCircle className="h-4 w-4" /> Start quiz
                        </Link>
                      </Button>
                    ) : (
                      <Badge variant="outline">
                        <Lock className="h-3.5 w-3.5" /> Quiz not available yet
                      </Badge>
                    )}
                  </div>
                ) : null}

                {/* Prev / next */}
                <div className="flex items-center justify-between border-t pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    disabled={activeIndex === 0}
                    onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    disabled={activeIndex === totalCount - 1}
                    onClick={() => setActiveIndex((i) => Math.min(totalCount - 1, i + 1))}
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  )
}
