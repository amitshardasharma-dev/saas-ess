'use client'

// Phase 6 — edit an existing quiz. Loads the aggregate, maps it to a builder
// draft, and renders the shared QuizBuilder.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import QuizBuilder from '@/components/quizzes/QuizBuilder'
import { getQuiz } from '@/services/quiz'
import type { QuizUpsertInput } from '@/lib/quiz/schemas'
import type { QuizWithQuestions } from '@/types/quiz'

function toDraft(quiz: QuizWithQuestions): QuizUpsertInput {
  return {
    title: quiz.title,
    description: quiz.description,
    passing_score: quiz.passing_score,
    attempt_limit: quiz.attempt_limit,
    randomize_questions: quiz.randomize_questions,
    time_limit_seconds: quiz.time_limit_seconds,
    feedback_timing: quiz.feedback_timing,
    show_explanations: quiz.show_explanations,
    status: quiz.status,
    questions: quiz.questions.map((q, i) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      explanation: q.explanation,
      accepted_answers: q.accepted_answers ?? [],
      sort_order: i,
      options: q.options.map((o, j) => ({
        id: o.id,
        label: o.label,
        is_correct: o.is_correct,
        sort_order: j,
      })),
    })),
  }
}

export default function EditQuizPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [initial, setInitial] = useState<QuizUpsertInput | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getQuiz(id)
      .then((q) => setInitial(toDraft(q)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load quiz'))
  }, [id])

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>
  if (!initial) return <p className="p-6 text-sm text-gray-500">Loading…</p>
  return <QuizBuilder quizId={id} initial={initial} />
}
