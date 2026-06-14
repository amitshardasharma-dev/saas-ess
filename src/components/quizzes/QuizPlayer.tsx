'use client'

// Phase 6 — quiz runtime player. Starts an attempt, renders questions in the
// server-provided (optionally randomized) order, runs a countdown for the time
// limit, and submits answers for grading. On submit it shows the result and any
// feedback/explanations permitted by the quiz's feedback_timing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { startAttempt, submitAttempt } from '@/services/quiz'
import { orderQuestions } from '@/lib/quiz/randomize'
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

export default function QuizPlayer({ quizId, trainingItemId }: QuizPlayerProps) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null)
  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({})
  const [result, setResult] = useState<QuizAttempt | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const startedRef = useRef(false)

  const submit = useCallback(
    async (auto: boolean) => {
      if (!attempt || submitting || result) return
      setSubmitting(true)
      try {
        const { attempt: finalAttempt } = await submitAttempt(attempt.id, {
          answers: Object.values(answers),
        })
        setResult(finalAttempt)
        if (!auto) toast.success('Quiz submitted')
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

  function setSingle(questionId: string, optionId: string) {
    setAnswers((a) => ({ ...a, [questionId]: { question_id: questionId, selected_option_ids: [optionId] } }))
  }

  function toggleMulti(questionId: string, optionId: string) {
    setAnswers((a) => {
      const current = a[questionId]?.selected_option_ids ?? []
      const next = current.includes(optionId)
        ? current.filter((x) => x !== optionId)
        : [...current, optionId]
      return { ...a, [questionId]: { question_id: questionId, selected_option_ids: next } }
    })
  }

  function setText(questionId: string, text: string) {
    setAnswers((a) => ({ ...a, [questionId]: { question_id: questionId, text_answer: text } }))
  }

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>
  if (!quiz || !attempt) return <p className="p-6 text-sm text-gray-500">Starting quiz…</p>

  if (result) {
    const showExplanations = quiz.show_explanations && quiz.feedback_timing !== 'after_close'
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <h1 className="text-2xl font-semibold">{quiz.title}</h1>
        <div className="rounded-md border p-4">
          <p className="text-lg font-medium">
            {result.status === 'graded'
              ? result.passed
                ? '✅ Passed'
                : '❌ Did not pass'
              : '⏳ Submitted — awaiting manual grading'}
          </p>
          {result.score != null && <p className="text-sm text-gray-600">Score: {result.score}%</p>}
        </div>
        {showExplanations &&
          orderedQuestions
            .filter((q) => q.explanation)
            .map((q) => (
              <div key={q.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{q.prompt}</p>
                <p className="text-gray-600">{q.explanation}</p>
              </div>
            ))}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{quiz.title}</h1>
        {remaining != null && (
          <span className="rounded-md bg-gray-100 px-3 py-1 text-sm font-mono">
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </span>
        )}
      </div>
      {quiz.description && <p className="text-sm text-gray-500">{quiz.description}</p>}

      {orderedQuestions.map((q, i) => (
        <QuestionRunner
          key={q.id}
          index={i}
          question={q}
          answer={answers[q.id]}
          onSingle={(optId) => setSingle(q.id, optId)}
          onMulti={(optId) => toggleMulti(q.id, optId)}
          onText={(t) => setText(q.id, t)}
        />
      ))}

      <button
        type="button"
        disabled={submitting}
        onClick={() => submit(false)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  )
}

function QuestionRunner({
  index,
  question,
  answer,
  onSingle,
  onMulti,
  onText,
}: {
  index: number
  question: QuizQuestionWithOptions
  answer?: AnswerInput
  onSingle: (optionId: string) => void
  onMulti: (optionId: string) => void
  onText: (text: string) => void
}) {
  const selected = answer?.selected_option_ids ?? []
  return (
    <div className="space-y-2 rounded-md border p-4">
      <p className="font-medium">
        {index + 1}. {question.prompt}
      </p>

      {(question.type === 'mc_single' || question.type === 'true_false') &&
        question.options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`q-${question.id}`}
              checked={selected.includes(o.id)}
              onChange={() => onSingle(o.id)}
            />
            {o.label}
          </label>
        ))}

      {question.type === 'mc_multi' &&
        question.options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onMulti(o.id)} />
            {o.label}
          </label>
        ))}

      {question.type === 'short_answer' && (
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={answer?.text_answer ?? ''}
          onChange={(e) => onText(e.target.value)}
        />
      )}

      {question.type === 'essay' && (
        <textarea
          rows={5}
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={answer?.text_answer ?? ''}
          onChange={(e) => onText(e.target.value)}
        />
      )}
    </div>
  )
}
