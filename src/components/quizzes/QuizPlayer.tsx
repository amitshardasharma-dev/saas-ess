'use client'

// Phase 6 — quiz runtime player. Starts an attempt, renders questions in the
// server-provided (optionally randomized) order, runs a countdown for the time
// limit, and submits answers for grading. On submit it shows a results screen with
// the score and pass/fail, plus explanations governed by the quiz's feedback_timing.
//
// feedback_timing handling (anti-cheat preserving):
//   after_close  — never reveal explanations or correctness, even on results.
//   after_submit — reveal explanations (and per-question correctness, computed
//                  locally) only on the results screen, after submission.
//   immediate    — once the learner LOCKS an answer for a question ("Check
//                  answer"), reveal that question's correctness + explanation
//                  before final submit. Correctness is computed from the option
//                  is_correct flags / accepted_answers that the start-attempt
//                  payload already includes; we never surface them until the
//                  learner has committed their own answer for that question.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  Lightbulb,
  Loader2,
  RotateCcw,
  Send,
  Trophy,
  XCircle,
} from 'lucide-react'
import { startAttempt, submitAttempt } from '@/services/quiz'
import { orderQuestions } from '@/lib/quiz/randomize'
import { normalizeText, sameIdSet } from '@/lib/quiz/grading'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type {
  AnswerInput,
  QuizAttempt,
  QuizQuestionWithOptions,
  QuizWithQuestions,
} from '@/types/quiz'

export interface QuizPlayerProps {
  quizId: string
  /** Optional training item that launched this quiz (feeds Phase 5 on grade). */
  trainingItemId?: string | null
}

/** Has the learner provided any answer for this question yet? */
function isAnswered(q: QuizQuestionWithOptions, answer?: AnswerInput): boolean {
  if (q.type === 'short_answer' || q.type === 'essay') return Boolean(answer?.text_answer?.trim())
  return (answer?.selected_option_ids?.length ?? 0) > 0
}

/**
 * Client-side correctness for the immediate/after-submit reveal. Mirrors the pure
 * grading rules but is used ONLY for feedback display — the server remains the
 * authority for the actual score. Returns null when correctness can't be judged
 * on the client (e.g. essay, or short answer without accepted answers => manual).
 */
function localCorrect(q: QuizQuestionWithOptions, answer?: AnswerInput): boolean | null {
  const selected = answer?.selected_option_ids ?? []
  switch (q.type) {
    case 'mc_single':
    case 'true_false': {
      const correctIds = q.options.filter((o) => o.is_correct).map((o) => o.id)
      return selected.length === 1 && correctIds.includes(selected[0])
    }
    case 'mc_multi': {
      const correctIds = q.options.filter((o) => o.is_correct).map((o) => o.id)
      return sameIdSet(selected, correctIds)
    }
    case 'short_answer': {
      const accepted = q.accepted_answers ?? []
      if (accepted.length === 0) return null // manually graded
      const norm = normalizeText(answer?.text_answer ?? '')
      return norm.length > 0 && accepted.some((a) => normalizeText(a) === norm)
    }
    default:
      return null // essay => manual
  }
}

export default function QuizPlayer({ quizId, trainingItemId }: QuizPlayerProps) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null)
  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({})
  const [locked, setLocked] = useState<Record<string, boolean>>({}) // immediate-mode revealed questions
  const [result, setResult] = useState<QuizAttempt | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const startedRef = useRef(false)
  const startTimeRef = useRef<number | null>(null)

  const isImmediate = quiz?.feedback_timing === 'immediate' && quiz.show_explanations

  const submit = useCallback(
    async (auto: boolean) => {
      if (!attempt || submitting || result) return
      setSubmitting(true)
      setConfirmOpen(false)
      try {
        const elapsed = startTimeRef.current
          ? Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000))
          : undefined
        const { attempt: finalAttempt } = await submitAttempt(attempt.id, {
          answers: Object.values(answers),
          time_spent_seconds: elapsed,
        })
        setResult(finalAttempt)
        if (!auto) toast.success('Quiz submitted')
        else toast('Time is up — your answers were submitted', { icon: '⏱️' })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Submit failed')
      } finally {
        setSubmitting(false)
      }
    },
    [attempt, answers, submitting, result]
  )

  // Start exactly one attempt on mount.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    startAttempt({ quiz_id: quizId, training_item_id: trainingItemId ?? null })
      .then(({ attempt: a, quiz: q }) => {
        setAttempt(a)
        setQuiz(q)
        startTimeRef.current = new Date(a.started_at).getTime()
        if (q.time_limit_seconds) {
          const deadline = new Date(a.started_at).getTime() + q.time_limit_seconds * 1000
          setRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)))
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not start quiz'))
  }, [quizId, trainingItemId])

  // Countdown — auto-submit at zero.
  useEffect(() => {
    if (remaining == null || result) return
    if (remaining <= 0) {
      void submit(true)
      return
    }
    const t = setTimeout(() => setRemaining((r) => (r == null ? r : r - 1)), 1000)
    return () => clearTimeout(t)
  }, [remaining, result, submit])

  const orderedQuestions = useMemo(() => {
    if (!quiz || !attempt) return []
    return orderQuestions(quiz.questions, quiz.randomize_questions, attempt.id)
  }, [quiz, attempt])

  const answeredCount = useMemo(
    () => orderedQuestions.filter((q) => isAnswered(q, answers[q.id])).length,
    [orderedQuestions, answers]
  )

  function setSingle(questionId: string, optionId: string) {
    if (locked[questionId]) return
    setAnswers((a) => ({ ...a, [questionId]: { question_id: questionId, selected_option_ids: [optionId] } }))
  }

  function toggleMulti(questionId: string, optionId: string) {
    if (locked[questionId]) return
    setAnswers((a) => {
      const current = a[questionId]?.selected_option_ids ?? []
      const next = current.includes(optionId)
        ? current.filter((x) => x !== optionId)
        : [...current, optionId]
      return { ...a, [questionId]: { question_id: questionId, selected_option_ids: next } }
    })
  }

  function setText(questionId: string, text: string) {
    if (locked[questionId]) return
    setAnswers((a) => ({ ...a, [questionId]: { question_id: questionId, text_answer: text } }))
  }

  /* ---------- states ---------- */

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm">
            <AlertTriangle className="h-10 w-10 text-destructive/70" />
            <p className="text-muted-foreground">{error}</p>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/dashboard/training">Back to training</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!quiz || !attempt) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting your quiz…
          </CardContent>
        </Card>
      </div>
    )
  }

  // Results screen
  if (result) {
    return (
      <ResultsScreen
        quiz={quiz}
        result={result}
        orderedQuestions={orderedQuestions}
        answers={answers}
        trainingItemId={trainingItemId}
      />
    )
  }

  const total = orderedQuestions.length
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0
  const lowTime = remaining != null && remaining <= 30

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      {/* Header + sticky progress/timer */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{quiz.title}</h1>
        {quiz.description ? <p className="mt-1 text-sm text-muted-foreground">{quiz.description}</p> : null}
      </div>

      <div className="sticky top-0 z-10 -mx-6 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {answeredCount} of {total} answered
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progressPct}%` }}
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
          {remaining != null ? (
            <div
              className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium tabular-nums ${
                lowTime ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'text-foreground'
              }`}
              aria-live="polite"
            >
              <Clock className="h-4 w-4" />
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </div>
          ) : null}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {orderedQuestions.map((q, i) => (
          <QuestionRunner
            key={q.id}
            index={i}
            question={q}
            answer={answers[q.id]}
            locked={Boolean(locked[q.id])}
            immediate={Boolean(isImmediate)}
            onSingle={(optId) => setSingle(q.id, optId)}
            onMulti={(optId) => toggleMulti(q.id, optId)}
            onText={(t) => setText(q.id, t)}
            onLock={() => setLocked((l) => ({ ...l, [q.id]: true }))}
          />
        ))}
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between gap-3 border-t pt-5">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/training">
            <ArrowLeft className="h-4 w-4" /> Exit
          </Link>
        </Button>
        <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> Submit quiz
            </>
          )}
        </Button>
      </div>

      {/* Confirmation dialog */}
      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={() => setConfirmOpen(false)}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle id="confirm-title" className="text-base">
                Submit your quiz?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You&apos;ve answered <strong className="text-foreground">{answeredCount}</strong> of {total}{' '}
                question{total === 1 ? '' : 's'}.
                {answeredCount < total
                  ? ' Unanswered questions will be marked incorrect.'
                  : ' You can review the results once you submit.'}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  Keep working
                </Button>
                <Button onClick={() => submit(false)} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                    </>
                  ) : (
                    'Submit now'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

/* ---------- per-question runner ---------- */

function QuestionRunner({
  index,
  question,
  answer,
  locked,
  immediate,
  onSingle,
  onMulti,
  onText,
  onLock,
}: {
  index: number
  question: QuizQuestionWithOptions
  answer?: AnswerInput
  locked: boolean
  immediate: boolean
  onSingle: (optionId: string) => void
  onMulti: (optionId: string) => void
  onText: (text: string) => void
  onLock: () => void
}) {
  const selected = answer?.selected_option_ids ?? []
  const answered = isAnswered(question, answer)
  const correct = locked ? localCorrect(question, answer) : null
  const correctIds = useMemo(
    () => new Set(question.options.filter((o) => o.is_correct).map((o) => o.id)),
    [question.options]
  )

  // Visual treatment for an option row once the question is locked (immediate mode).
  function optionState(optionId: string): 'correct' | 'wrong' | 'neutral' {
    if (!locked) return 'neutral'
    const isSel = selected.includes(optionId)
    if (correctIds.has(optionId)) return 'correct'
    if (isSel) return 'wrong'
    return 'neutral'
  }

  return (
    <Card className={locked ? 'border-foreground/15' : ''}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-2">
          <Badge variant="secondary" className="mt-0.5 shrink-0 tabular-nums">
            {index + 1}
          </Badge>
          <p className="flex-1 font-medium text-foreground">{question.prompt}</p>
          <Badge variant="outline" className="shrink-0 text-xs">
            {question.points} pt{question.points === 1 ? '' : 's'}
          </Badge>
        </div>

        {/* mc_single / true_false */}
        {(question.type === 'mc_single' || question.type === 'true_false') &&
          question.options.map((o) => (
            <OptionRow
              key={o.id}
              type="radio"
              name={`q-${question.id}`}
              label={o.label}
              checked={selected.includes(o.id)}
              disabled={locked}
              state={optionState(o.id)}
              onChange={() => onSingle(o.id)}
            />
          ))}

        {/* mc_multi */}
        {question.type === 'mc_multi' &&
          question.options.map((o) => (
            <OptionRow
              key={o.id}
              type="checkbox"
              label={o.label}
              checked={selected.includes(o.id)}
              disabled={locked}
              state={optionState(o.id)}
              onChange={() => onMulti(o.id)}
            />
          ))}

        {/* short_answer */}
        {question.type === 'short_answer' && (
          <Input
            value={answer?.text_answer ?? ''}
            disabled={locked}
            placeholder="Type your answer"
            onChange={(e) => onText(e.target.value)}
          />
        )}

        {/* essay */}
        {question.type === 'essay' && (
          <Textarea
            rows={5}
            value={answer?.text_answer ?? ''}
            disabled={locked}
            placeholder="Write your response"
            onChange={(e) => onText(e.target.value)}
          />
        )}

        {/* Immediate-feedback: check-answer affordance + reveal */}
        {immediate && !locked ? (
          <div className="pt-1">
            <Button type="button" variant="outline" size="sm" disabled={!answered} onClick={onLock}>
              <Eye className="h-3.5 w-3.5" /> Check answer
            </Button>
            {!answered ? (
              <span className="ml-2 text-xs text-muted-foreground">Answer first to see feedback.</span>
            ) : null}
          </div>
        ) : null}

        {immediate && locked ? (
          <div className="space-y-2 pt-1">
            {correct === true ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Correct
              </p>
            ) : correct === false ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <XCircle className="h-4 w-4" /> Not quite
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Circle className="h-4 w-4" /> Recorded — this will be reviewed
              </p>
            )}
            {question.explanation ? (
              <ExplanationNote text={question.explanation} />
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function OptionRow({
  type,
  name,
  label,
  checked,
  disabled,
  state,
  onChange,
}: {
  type: 'radio' | 'checkbox'
  name?: string
  label: string
  checked: boolean
  disabled: boolean
  state: 'correct' | 'wrong' | 'neutral'
  onChange: () => void
}) {
  const stateClass =
    state === 'correct'
      ? 'border-green-300 bg-green-50/60'
      : state === 'wrong'
        ? 'border-destructive/40 bg-destructive/5'
        : checked
          ? 'border-primary/40 bg-primary/5'
          : 'hover:bg-muted/40'
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${stateClass} ${
        disabled ? 'cursor-default' : ''
      }`}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className={`h-4 w-4 ${state === 'correct' ? 'accent-green-600' : 'accent-primary'}`}
      />
      <span className="flex-1">{label}</span>
      {state === 'correct' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
      {state === 'wrong' ? <XCircle className="h-4 w-4 text-destructive" /> : null}
    </label>
  )
}

function ExplanationNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div>
        <p className="font-medium text-foreground">Explanation</p>
        <p className="text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

/* ---------- results screen ---------- */

function ResultsScreen({
  quiz,
  result,
  orderedQuestions,
  answers,
  trainingItemId,
}: {
  quiz: QuizWithQuestions
  result: QuizAttempt
  orderedQuestions: QuizQuestionWithOptions[]
  answers: Record<string, AnswerInput>
  trainingItemId?: string | null
}) {
  // after_close hides explanations entirely; immediate + after_submit reveal them here.
  const showExplanations = quiz.show_explanations && quiz.feedback_timing !== 'after_close'
  const pending = result.status !== 'graded'
  const passed = result.passed === true
  const score = result.score ?? 0

  const canRetry =
    quiz.attempt_limit == null || result.attempt_no < quiz.attempt_limit

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-foreground">{quiz.title}</h1>

      {/* Hero result */}
      <Card
        className={
          pending
            ? 'border-amber-200 bg-amber-50/60'
            : passed
              ? 'border-green-200 bg-green-50/60'
              : 'border-destructive/30 bg-destructive/5'
        }
      >
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          {pending ? (
            <Clock className="h-12 w-12 text-amber-600" />
          ) : passed ? (
            <Trophy className="h-12 w-12 text-green-600" />
          ) : (
            <XCircle className="h-12 w-12 text-destructive" />
          )}
          <div>
            <h2 className="text-xl font-semibold">
              {pending ? 'Submitted for review' : passed ? 'You passed!' : 'Not passed yet'}
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {pending
                ? 'Some answers need manual grading. Your final score and result will appear once a reviewer has graded them.'
                : passed
                  ? 'Great work — you met the passing score for this assessment.'
                  : `You needed ${quiz.passing_score}% to pass. Review the feedback below${
                      canRetry ? ' and try again' : ''
                    }.`}
            </p>
          </div>

          {/* Score */}
          <div className="flex items-center gap-6">
            <div>
              <p className="text-3xl font-semibold tabular-nums text-foreground">
                {pending ? '—' : `${Math.round(score)}%`}
              </p>
              <p className="text-xs text-muted-foreground">Your score</p>
            </div>
            <div className="h-10 w-px bg-border" />
            <div>
              <p className="text-3xl font-semibold tabular-nums text-foreground">{quiz.passing_score}%</p>
              <p className="text-xs text-muted-foreground">To pass</p>
            </div>
          </div>

          {!pending ? (
            <Badge className={passed ? 'bg-green-100 text-green-800' : 'bg-destructive/10 text-destructive'}>
              {passed ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5" /> Did not pass
                </>
              )}
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {/* Per-question review */}
      {showExplanations ? (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Review</h2>
          {orderedQuestions.map((q, i) => {
            const correct = localCorrect(q, answers[q.id])
            return (
              <Card key={q.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="mt-0.5 shrink-0 tabular-nums">
                      {i + 1}
                    </Badge>
                    <p className="flex-1 font-medium text-foreground">{q.prompt}</p>
                    {correct === true ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    ) : correct === false ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  {q.explanation ? (
                    <ExplanationNote text={q.explanation} />
                  ) : (
                    <p className="text-xs text-muted-foreground">No explanation provided for this question.</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <Button asChild variant="outline">
          <Link href="/dashboard/training">
            <ArrowLeft className="h-4 w-4" /> Back to training
          </Link>
        </Button>
        {!passed && !pending && canRetry ? (
          <Button
            onClick={() => {
              // Force a full reload so a brand-new attempt is started (a client
              // nav to the same route would not remount the player).
              const item = trainingItemId ? `?item=${trainingItemId}` : ''
              window.location.href = `/dashboard/training/quiz/${quiz.id}${item}`
            }}
          >
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
        ) : null}
      </div>
    </div>
  )
}
