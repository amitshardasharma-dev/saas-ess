'use client'

// Phase 6 — grade a single attempt. Staff/Admin only. Shows each question with the
// volunteer's answer; auto-graded answers are read-only, manual ones (essay /
// unconfigured short answer) take a points input (bounded by the question max) plus
// an optional comment. Submitting recomputes pass/fail and (when the last pending
// answer is graded) feeds Phase 5 training completion.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Save,
  Target,
  XCircle,
} from 'lucide-react'
import { gradeAttempt, getGradingAttempt } from '@/services/quiz'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { QUESTION_TYPE_META } from '@/components/quizzes/QuestionEditor'
import type { QuizAnswer, QuizAttempt, QuizQuestionWithOptions, QuizWithQuestions } from '@/types/quiz'

interface GradingData {
  attempt: QuizAttempt
  quiz: QuizWithQuestions | null
  answers: QuizAnswer[]
}

export default function GradeAttemptPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const attemptId = params?.id
  const [data, setData] = useState<GradingData | null>(null)
  const [points, setPoints] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    ;(async () => {
      try {
        const d = await getGradingAttempt(attemptId)
        if (cancelled) return
        setData(d)
        // Seed inputs from any existing grades so re-grading is non-destructive.
        const seedPoints: Record<string, number> = {}
        const seedComments: Record<string, string> = {}
        for (const a of d.answers) {
          if (a.awarded_points != null) seedPoints[a.id] = a.awarded_points
          if (a.grader_comment) seedComments[a.id] = a.grader_comment
        }
        setPoints(seedPoints)
        setComments(seedComments)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load attempt')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attemptId])

  const questionById = useMemo(
    () => new Map((data?.quiz?.questions ?? []).map((q) => [q.id, q])),
    [data]
  )

  const pendingAnswers = useMemo(() => (data?.answers ?? []).filter((a) => a.needs_manual), [data])

  // Live score preview: total possible vs awarded (using current inputs for pending).
  const preview = useMemo(() => {
    if (!data?.quiz) return null
    const total = data.quiz.questions.reduce((sum, q) => sum + q.points, 0)
    const awardedByQuestion = new Map<string, number>()
    for (const a of data.answers) {
      const max = questionById.get(a.question_id)?.points ?? 0
      const val = a.needs_manual ? Math.min(points[a.id] ?? 0, max) : a.awarded_points ?? 0
      awardedByQuestion.set(a.question_id, val)
    }
    const awarded = data.quiz.questions.reduce((sum, q) => sum + (awardedByQuestion.get(q.id) ?? 0), 0)
    const pct = total > 0 ? Math.round((awarded / total) * 100) : 0
    return { total, awarded, pct, willPass: pct >= data.quiz.passing_score, passingScore: data.quiz.passing_score }
  }, [data, points, questionById])

  async function submit() {
    if (!data || !attemptId) return
    if (pendingAnswers.length === 0) {
      toast('Nothing left to grade')
      return
    }
    const grades = pendingAnswers.map((a) => {
      const max = questionById.get(a.question_id)?.points ?? Infinity
      return {
        answer_id: a.id,
        awarded_points: Math.max(0, Math.min(points[a.id] ?? 0, max)),
        grader_comment: comments[a.id]?.trim() || null,
      }
    })
    setSaving(true)
    try {
      await gradeAttempt(attemptId, { grades })
      toast.success('Grades saved')
      router.push('/dashboard/grading')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save grades')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm">
            <AlertCircle className="h-10 w-10 text-destructive/70" />
            <p className="text-muted-foreground">{error}</p>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/dashboard/grading">Back to queue</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading attempt…
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 pb-28">
      {/* Header */}
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground">
          <Link href="/dashboard/grading">
            <ArrowLeft className="h-4 w-4" /> Grading queue
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">{data.quiz?.title ?? 'Grade attempt'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Attempt #{data.attempt.attempt_no} · submitted{' '}
          {data.attempt.submitted_at ? new Date(data.attempt.submitted_at).toLocaleString() : '—'}
        </p>
      </div>

      {/* Score preview */}
      {preview ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{preview.pct}%</p>
                <p className="text-xs text-muted-foreground">
                  {preview.awarded} / {preview.total} pts (with current grades)
                </p>
              </div>
              <div className="h-9 w-px bg-border" />
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Target className="h-4 w-4" /> Pass at {preview.passingScore}%
              </div>
            </div>
            <Badge
              className={
                preview.willPass ? 'bg-green-100 text-green-800' : 'bg-destructive/10 text-destructive'
              }
            >
              {preview.willPass ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Will pass
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5" /> Below passing
                </>
              )}
            </Badge>
          </CardContent>
        </Card>
      ) : null}

      {/* Answers */}
      <div className="space-y-3">
        {data.answers.map((a, i) => {
          const q = questionById.get(a.question_id)
          return (
            <AnswerCard
              key={a.id}
              index={i}
              question={q}
              answer={a}
              points={points[a.id]}
              comment={comments[a.id] ?? ''}
              onPoints={(v) => setPoints((p) => ({ ...p, [a.id]: v }))}
              onComment={(v) => setComments((c) => ({ ...c, [a.id]: v }))}
            />
          )
        })}
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-6 py-3">
          <span className="text-xs text-muted-foreground">
            {pendingAnswers.length > 0
              ? `${pendingAnswers.length} answer${pendingAnswers.length === 1 ? '' : 's'} need grading`
              : 'All answers are graded'}
          </span>
          <Button onClick={submit} disabled={saving || pendingAnswers.length === 0}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save grades
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ---------- answer card ---------- */

function AnswerCard({
  index,
  question,
  answer,
  points,
  comment,
  onPoints,
  onComment,
}: {
  index: number
  question?: QuizQuestionWithOptions
  answer: QuizAnswer
  points?: number
  comment: string
  onPoints: (v: number) => void
  onComment: (v: string) => void
}) {
  const manual = answer.needs_manual
  const max = question?.points ?? 0
  const typeMeta = question ? QUESTION_TYPE_META[question.type] : null

  // Render the learner's response: option labels for objective types, else text.
  const optionLabels =
    answer.selected_option_ids && question
      ? answer.selected_option_ids
          .map((id) => question.options.find((o) => o.id === id)?.label)
          .filter(Boolean)
      : []

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          <Badge variant="secondary" className="mt-0.5 shrink-0 tabular-nums">
            {index + 1}
          </Badge>
          <CardTitle className="flex-1 text-base font-medium leading-snug">
            {question?.prompt ?? 'Question'}
          </CardTitle>
          {typeMeta ? (
            <Badge variant="outline" className="shrink-0 text-xs">
              {typeMeta.label}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Learner response */}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Response</p>
          {answer.text_answer ? (
            <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm text-foreground">
              {answer.text_answer}
            </p>
          ) : optionLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {optionLabels.map((l, i) => (
                <Badge key={i} variant="outline">
                  {l}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
              No answer provided.
            </p>
          )}
        </div>

        {manual ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5">
              <Label className="text-sm">Points (max {max})</Label>
              <Input
                type="number"
                min={0}
                max={max}
                value={points ?? ''}
                placeholder="0"
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Number(e.target.value)
                  onPoints(Math.max(0, Math.min(v, max)))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /> Comment
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                rows={2}
                value={comment}
                placeholder="Feedback for the learner"
                onChange={(e) => onComment(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-3 text-sm">
            {(answer.awarded_points ?? 0) > 0 ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">
              Auto-graded:{' '}
              <strong className="text-foreground">
                {answer.awarded_points ?? 0} / {max} pt{max === 1 ? '' : 's'}
              </strong>
            </span>
          </div>
        )}

        {/* Show any existing grader comment on already-graded manual answers */}
        {!manual && answer.grader_comment ? (
          <p className="text-xs text-muted-foreground">Comment: {answer.grader_comment}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
