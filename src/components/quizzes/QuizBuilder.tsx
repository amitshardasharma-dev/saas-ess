'use client'

// Phase 6 — no-code quiz builder. A pure-UI editor over a QuizUpsertInput draft:
// configure quiz settings, add / reorder / duplicate / delete questions of every
// type, edit options + correct flags, and persist via the create/update services.
// Validated with the same Zod schema the API uses, so a client-side pre-check
// surfaces the exact issues the server would reject.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  ArrowLeft,
  CircleDot,
  Clock,
  FileQuestion,
  Hourglass,
  ListChecks,
  Loader2,
  Percent,
  Plus,
  Repeat,
  Save,
  Settings2,
  Sparkles,
  Target,
} from 'lucide-react'
import {
  FEEDBACK_TIMINGS,
  QUESTION_TYPES,
  type FeedbackTiming,
  type QuestionDraft,
  type QuestionType,
  type QuizStatus,
} from '@/types/quiz'
import { quizUpsertSchema, type QuizUpsertInput } from '@/lib/quiz/schemas'
import { createQuiz, updateQuiz } from '@/services/quiz'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QuestionEditor, QUESTION_TYPE_META } from './QuestionEditor'

export interface QuizBuilderProps {
  quizId?: string
  initial?: QuizUpsertInput
}

const FEEDBACK_TIMING_LABELS: Record<FeedbackTiming, { label: string; hint: string }> = {
  immediate: { label: 'Immediately', hint: 'Reveal the explanation right after each answer is locked in' },
  after_submit: { label: 'After submitting', hint: 'Reveal explanations on the results screen' },
  after_close: { label: 'Never', hint: 'Keep explanations hidden from the taker' },
}

const STATUS_LABELS: Record<QuizStatus, string> = {
  draft: 'Draft — not visible to volunteers',
  published: 'Published — available to take',
  archived: 'Archived — hidden, retained',
}

function emptyDraft(): QuizUpsertInput {
  return {
    title: '',
    description: '',
    passing_score: 70,
    attempt_limit: null,
    randomize_questions: false,
    time_limit_seconds: null,
    feedback_timing: 'after_submit',
    show_explanations: true,
    status: 'draft',
    questions: [],
  }
}

export function newQuestion(type: QuestionType, sortOrder: number): QuestionDraft {
  const base: QuestionDraft = {
    type,
    prompt: '',
    points: 1,
    explanation: '',
    accepted_answers: [],
    sort_order: sortOrder,
    options: [],
  }
  if (type === 'true_false') {
    base.options = [
      { label: 'True', is_correct: true, sort_order: 0 },
      { label: 'False', is_correct: false, sort_order: 1 },
    ]
  } else if (type === 'mc_single' || type === 'mc_multi') {
    base.options = [
      { label: '', is_correct: false, sort_order: 0 },
      { label: '', is_correct: false, sort_order: 1 },
    ]
  }
  return base
}

/** Map zod issues into { top-level field -> msg } and { questionIndex -> { field -> msg } }. */
function mapIssues(issues: { path: (string | number)[]; message: string }[]) {
  const top: Record<string, string> = {}
  const perQuestion: Record<number, Record<string, string>> = {}
  for (const issue of issues) {
    const [head, idx, field] = issue.path
    if (head === 'questions' && typeof idx === 'number') {
      const key = typeof field === 'string' ? field : 'options'
      perQuestion[idx] = { ...(perQuestion[idx] ?? {}), [key]: issue.message }
    } else if (typeof head === 'string') {
      top[head] = top[head] ?? issue.message
    }
  }
  return { top, perQuestion }
}

export default function QuizBuilder({ quizId, initial }: QuizBuilderProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<QuizUpsertInput>(initial ?? emptyDraft())
  const [saving, setSaving] = useState(false)
  const [addType, setAddType] = useState<QuestionType>('mc_single')
  const [topIssues, setTopIssues] = useState<Record<string, string>>({})
  const [questionIssues, setQuestionIssues] = useState<Record<number, Record<string, string>>>({})

  function patch(p: Partial<QuizUpsertInput>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function updateQuestion(index: number, q: QuestionDraft) {
    setDraft((d) => {
      const questions = d.questions.slice()
      questions[index] = q
      return { ...d, questions }
    })
  }

  function removeQuestion(index: number) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i })),
    }))
    setQuestionIssues({})
  }

  function duplicateQuestion(index: number) {
    setDraft((d) => {
      const src = d.questions[index]
      const copy: QuestionDraft = {
        ...src,
        id: undefined,
        accepted_answers: [...(src.accepted_answers ?? [])],
        options: src.options.map((o) => ({ ...o, id: undefined })),
      }
      const questions = [
        ...d.questions.slice(0, index + 1),
        copy,
        ...d.questions.slice(index + 1),
      ].map((q, i) => ({ ...q, sort_order: i }))
      return { ...d, questions }
    })
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const questions = d.questions.slice()
      const target = index + dir
      if (target < 0 || target >= questions.length) return d
      ;[questions[index], questions[target]] = [questions[target], questions[index]]
      return { ...d, questions: questions.map((q, i) => ({ ...q, sort_order: i })) }
    })
    setQuestionIssues({})
  }

  function addQuestion() {
    setDraft((d) => ({
      ...d,
      questions: [...d.questions, newQuestion(addType, d.questions.length)],
    }))
  }

  const stats = useMemo(() => {
    const totalPoints = draft.questions.reduce((sum, q) => sum + (q.points || 0), 0)
    const byType = draft.questions.reduce<Record<string, number>>((acc, q) => {
      acc[q.type] = (acc[q.type] ?? 0) + 1
      return acc
    }, {})
    return { count: draft.questions.length, totalPoints, byType }
  }, [draft.questions])

  async function save() {
    const parsed = quizUpsertSchema.safeParse(draft)
    if (!parsed.success) {
      const { top, perQuestion } = mapIssues(parsed.error.issues)
      setTopIssues(top)
      setQuestionIssues(perQuestion)
      const first = parsed.error.issues[0]
      toast.error(first ? first.message : 'Please fix the highlighted fields')
      return
    }
    setTopIssues({})
    setQuestionIssues({})
    setSaving(true)
    try {
      if (quizId) {
        await updateQuiz(quizId, parsed.data)
        toast.success('Quiz saved')
      } else {
        const { id } = await createQuiz(parsed.data)
        toast.success('Quiz created')
        router.push(`/dashboard/quizzes/${id}`)
        return
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const timeLimitMinutes = draft.time_limit_seconds ? Math.round(draft.time_limit_seconds / 60) : ''

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 pb-28">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground">
            <Link href="/dashboard/quizzes">
              <ArrowLeft className="h-4 w-4" /> Quizzes
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{quizId ? 'Edit quiz' : 'New quiz'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build an assessment — questions, scoring, and rules. No code required.
          </p>
        </div>
        <Badge variant={draft.status === 'published' ? 'default' : 'outline'} className="capitalize">
          {draft.status}
        </Badge>
      </div>

      {/* Basics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" /> Quiz details
          </CardTitle>
          <CardDescription>Give your assessment a clear title and a short description.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={draft.title}
              placeholder="e.g. Food Safety Basics"
              onChange={(e) => patch({ title: e.target.value })}
              className={topIssues.title ? 'border-destructive' : ''}
            />
            {topIssues.title ? <p className="text-xs text-destructive">{topIssues.title}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Description</Label>
            <Textarea
              value={draft.description ?? ''}
              placeholder="What this quiz covers and who should take it."
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-muted-foreground" /> Rules &amp; scoring
          </CardTitle>
          <CardDescription>Control how the quiz is scored, timed, and what feedback learners see.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Target className="h-3.5 w-3.5 text-muted-foreground" /> Passing score
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.passing_score}
                  onChange={(e) =>
                    patch({ passing_score: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                  }
                  className="pr-9"
                />
                <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Repeat className="h-3.5 w-3.5 text-muted-foreground" /> Attempt limit
              </Label>
              <Input
                type="number"
                min={1}
                value={draft.attempt_limit ?? ''}
                placeholder="Unlimited"
                onChange={(e) =>
                  patch({ attempt_limit: e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1) })
                }
              />
              <p className="text-xs text-muted-foreground">Leave blank for unlimited attempts.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Hourglass className="h-3.5 w-3.5 text-muted-foreground" /> Time limit
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  value={timeLimitMinutes}
                  placeholder="No limit"
                  onChange={(e) =>
                    patch({
                      time_limit_seconds:
                        e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1) * 60,
                    })
                  }
                  className="pr-16"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  minutes
                </span>
              </div>
              {draft.time_limit_seconds ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {draft.time_limit_seconds} seconds total
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Leave blank for no countdown.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Status</Label>
              <Select value={draft.status} onValueChange={(v) => patch({ status: v as QuizStatus })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as QuizStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Answer feedback</Label>
              <Select
                value={draft.feedback_timing}
                onValueChange={(v) => patch({ feedback_timing: v as FeedbackTiming })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TIMINGS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FEEDBACK_TIMING_LABELS[t].label} — {FEEDBACK_TIMING_LABELS[t].hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ToggleRow
              checked={draft.randomize_questions}
              onChange={(v) => patch({ randomize_questions: v })}
              title="Randomize question order"
              hint="Each attempt sees questions in a different, stable order."
            />
            <ToggleRow
              checked={draft.show_explanations}
              onChange={(v) => patch({ show_explanations: v })}
              title="Show answer explanations"
              hint="Reveal per-question explanations according to the feedback timing above."
              disabled={draft.feedback_timing === 'after_close'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <FileQuestion className="h-4 w-4 text-muted-foreground" /> Questions
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {stats.count === 0
                ? 'Add your first question to get started.'
                : `${stats.count} question${stats.count === 1 ? '' : 's'} · ${stats.totalPoints} point${
                    stats.totalPoints === 1 ? '' : 's'
                  } total`}
            </p>
          </div>
          {stats.count > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(stats.byType) as QuestionType[]).map((t) => (
                <Badge key={t} variant="outline" className="gap-1 text-xs">
                  {QUESTION_TYPE_META[t].label} · {stats.byType[t]}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        {draft.questions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <ListChecks className="h-10 w-10 opacity-30" />
              No questions yet. Choose a type below and add one.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {draft.questions.map((q, i) => (
              <QuestionEditor
                key={i}
                index={i}
                total={draft.questions.length}
                question={q as QuestionDraft}
                issues={questionIssues[i]}
                onChange={(updated) => updateQuestion(i, updated)}
                onRemove={() => removeQuestion(i)}
                onDuplicate={() => duplicateQuestion(i)}
                onMoveUp={() => moveQuestion(i, -1)}
                onMoveDown={() => moveQuestion(i, 1)}
              />
            ))}
          </div>
        )}

        {/* Add question */}
        <Card className="border-dashed">
          <CardContent className="flex flex-wrap items-center gap-2 py-4">
            <CircleDot className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Add a</span>
            <Select value={addType} onValueChange={(v) => setAddType(v as QuestionType)}>
              <SelectTrigger className="w-[15rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {QUESTION_TYPE_META[t].label} — {QUESTION_TYPE_META[t].hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={addQuestion}>
              <Plus className="h-4 w-4" /> Add question
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {Object.keys(topIssues).length > 0 || Object.keys(questionIssues).length > 0 ? (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> Fix the highlighted fields to save.
              </span>
            ) : (
              <span>
                {stats.count} question{stats.count === 1 ? '' : 's'} · {stats.totalPoints} pts · pass at{' '}
                {draft.passing_score}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/quizzes">Cancel</Link>
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> {quizId ? 'Save changes' : 'Create quiz'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- toggle row ---------- */

function ToggleRow({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  hint: string
  disabled?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted/40'
      }`}
    >
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}
