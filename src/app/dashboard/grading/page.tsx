'use client'

// Phase 6 — manual-grade queue. Staff/Admin only. Lists submitted attempts with
// answers awaiting manual grading (essays / short answers) and links to each
// grading view.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
} from 'lucide-react'
import { listGradingQueue, type GradingQueueItem } from '@/services/quiz'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString()
}

export default function GradingQueuePage() {
  const [items, setItems] = useState<GradingQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listGradingQueue())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const totalPending = items.reduce((sum, i) => sum + i.pending, 0)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Grading queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Essays and short answers awaiting manual grading.
          </p>
        </div>
        {!loading && !error && totalPending > 0 ? (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            <Clock className="h-3.5 w-3.5" /> {totalPending} answer{totalPending === 1 ? '' : 's'} pending
          </Badge>
        ) : null}
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm">
            <AlertCircle className="h-10 w-10 text-destructive/70" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 text-green-500/60" />
            All caught up — nothing to grade right now.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map(({ attempt, quiz_title, pending }) => (
            <Card key={attempt.id} className="py-0 transition-colors hover:border-foreground/20">
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                  <ClipboardCheck className="h-5 w-5 text-amber-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-medium text-foreground">{quiz_title}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Submitted {timeAgo(attempt.submitted_at)}</span>
                    <span>·</span>
                    <span>Attempt #{attempt.attempt_no}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {pending} to grade
                </Badge>
                <Button asChild size="sm" className="shrink-0">
                  <Link href={`/dashboard/grading/${attempt.id}`}>Grade</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
