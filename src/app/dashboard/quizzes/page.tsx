'use client'

// Phase 6 — quiz management (no-code builder home). Lists quizzes for the tenant
// with create / edit / duplicate / delete actions and quick stats. Staff/Admin
// only (also gated server-side + by nav minRole).

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  ClipboardList,
  Clock,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Search,
  Target,
  Trash2,
} from 'lucide-react'
import type { Quiz, QuizStatus } from '@/types/quiz'
import { listQuizzes, duplicateQuizApi, deleteQuiz as deleteQuizApi } from '@/services/quiz'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const STATUS_STYLE: Record<QuizStatus, string> = {
  published: 'bg-green-100 text-green-800 hover:bg-green-100',
  draft: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  archived: 'bg-muted text-muted-foreground hover:bg-muted',
}

type StatusFilter = 'all' | QuizStatus

export default function QuizzesPage() {
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setQuizzes(await listQuizzes())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quizzes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDuplicate(id: string) {
    setBusyId(id)
    try {
      const { id: newId } = await duplicateQuizApi(id)
      toast.success('Quiz duplicated')
      router.push(`/dashboard/quizzes/${newId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Duplicate failed')
      setBusyId(null)
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return
    setBusyId(id)
    try {
      await deleteQuizApi(id)
      toast.success('Quiz deleted')
      setQuizzes((qs) => qs.filter((q) => q.id !== id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  const counts = useMemo(() => {
    return quizzes.reduce(
      (acc, q) => {
        acc.all += 1
        acc[q.status] += 1
        return acc
      },
      { all: 0, draft: 0, published: 0, archived: 0 } as Record<StatusFilter, number>
    )
  }, [quizzes])

  const filtered = quizzes.filter((q) => {
    const matchesSearch = !search || q.title.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = filter === 'all' || q.status === filter
    return matchesSearch && matchesStatus
  })

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'published', label: 'Published' },
    { key: 'draft', label: 'Drafts' },
    { key: 'archived', label: 'Archived' },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Quizzes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Build and manage assessments — no code required.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/quizzes/new">
            <Plus className="h-4 w-4" /> New quiz
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search quizzes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Badge
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {counts[f.key] > 0 ? <span className="ml-1 opacity-70">{counts[f.key]}</span> : null}
            </Badge>
          ))}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading quizzes…
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
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-10 w-10 opacity-30" />
            {quizzes.length === 0 ? 'No quizzes yet. Create your first assessment.' : 'No quizzes match your filters.'}
            {quizzes.length === 0 ? (
              <Button asChild size="sm" className="mt-2">
                <Link href="/dashboard/quizzes/new">
                  <Plus className="h-4 w-4" /> New quiz
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <Card key={q.id} className="py-0 transition-colors hover:border-foreground/20">
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <Link href={`/dashboard/quizzes/${q.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-medium text-foreground">{q.title}</h2>
                    <Badge className={`capitalize ${STATUS_STYLE[q.status]}`}>{q.status}</Badge>
                  </div>
                  {q.description ? (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{q.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" /> Pass at {q.passing_score}%
                    </span>
                    <span className="flex items-center gap-1">
                      <Repeat className="h-3.5 w-3.5" /> {q.attempt_limit ? `${q.attempt_limit} attempts` : 'Unlimited'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />{' '}
                      {q.time_limit_seconds ? `${Math.round(q.time_limit_seconds / 60)} min` : 'No time limit'}
                    </span>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/quizzes/${q.id}`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={busyId === q.id}
                    onClick={() => handleDuplicate(q.id)}
                    aria-label="Duplicate quiz"
                  >
                    {busyId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={busyId === q.id}
                    onClick={() => handleDelete(q.id, q.title)}
                    aria-label="Delete quiz"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
