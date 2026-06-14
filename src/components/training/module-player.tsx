// src/components/training/module-player.tsx
//
// Walks a module's items in order. Renders the active item (video / document /
// quiz), records acknowledgement + time ticks via the training service, and
// reflects per-item completion. Time ticks are throttled client-side to one
// every 15s of active view (server also caps + throttles).

'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VideoEmbed } from './video-embed'
import { ProgressBar } from './progress-bar'
import { trainingService } from '@/services/training'
import type { AssignedModule, TrainingItemWithProgress } from '@/types/training'
import { CheckCircle2, Circle, FileText, PlayCircle, HelpCircle } from 'lucide-react'

const TICK_INTERVAL_MS = 15_000
const TICK_SECONDS = 15

interface ModulePlayerProps {
  module: AssignedModule
  onProgress?: () => void
}

function itemIcon(type: string) {
  if (type === 'video') return PlayCircle
  if (type === 'document') return FileText
  return HelpCircle
}

export function ModulePlayer({ module, onProgress }: ModulePlayerProps) {
  const [items, setItems] = useState<TrainingItemWithProgress[]>(module.items)
  const [activeIndex, setActiveIndex] = useState(0)
  const active = items[activeIndex]
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, progress } : i))
      )
      toast.success('Marked complete')
      onProgress?.()
    } else {
      toast.error('Could not record completion')
    }
  }

  const onDownload = async (item: TrainingItemWithProgress) => {
    await trainingService.track(item.id, 'doc_downloaded')
  }

  if (!active) {
    return <p className="text-sm text-gray-500">This module has no items yet.</p>
  }

  const completedCount = items.filter((i) => i.progress?.status === 'complete').length

  return (
    <div className="space-y-4">
      <ProgressBar percent={module.percent_complete} />

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        {/* Item list / outline */}
        <nav className="space-y-1">
          {items.map((item, idx) => {
            const Icon = item.progress?.status === 'complete' ? CheckCircle2 : Circle
            const TypeIcon = itemIcon(item.type)
            return (
              <button
                key={item.id}
                onClick={() => setActiveIndex(idx)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                  idx === activeIndex ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    item.progress?.status === 'complete' ? 'text-green-600' : 'text-gray-300'
                  }`}
                />
                <TypeIcon className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="truncate">{item.title}</span>
                {!item.required && <span className="ml-auto text-xs text-gray-400">optional</span>}
              </button>
            )
          })}
          <p className="px-2 pt-2 text-xs text-gray-500">
            {completedCount} / {items.length} items done
          </p>
        </nav>

        {/* Active item */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{active.title}</CardTitle>
            <Badge variant={active.progress?.status === 'complete' ? 'default' : 'secondary'}>
              {active.progress?.status === 'complete' ? 'Complete' : active.type}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {active.type === 'video' && active.video_url && (
              <>
                <VideoEmbed url={active.video_url} title={active.title} />
                <Button
                  disabled={active.progress?.status === 'complete'}
                  onClick={() => markComplete(active, 'video_watched')}
                >
                  I watched this
                </Button>
              </>
            )}

            {active.type === 'document' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Download and read this document, then acknowledge it.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onDownload(active)}>
                    Download
                  </Button>
                  <Button
                    disabled={active.progress?.status === 'complete'}
                    onClick={() => markComplete(active, 'doc_acknowledged')}
                  >
                    I have read &amp; acknowledge
                  </Button>
                </div>
              </div>
            )}

            {active.type === 'quiz' && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Complete the associated quiz. Your result is recorded automatically; this item
                  completes when you pass.
                </p>
                {active.progress?.status === 'complete' ? (
                  <Badge>Passed</Badge>
                ) : (
                  <Badge variant="secondary">Not yet passed</Badge>
                )}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                disabled={activeIndex === items.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(items.length - 1, i + 1))}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
