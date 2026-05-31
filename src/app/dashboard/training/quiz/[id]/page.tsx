'use client'

// Phase 6 — take-quiz runtime, launched from a training item. The route param is
// the quiz id; an optional ?item= query param carries the launching training
// item id so a graded pass/fail feeds back into Phase 5 training completion.

import { useParams, useSearchParams } from 'next/navigation'
import QuizPlayer from '@/components/quizzes/QuizPlayer'

export default function TakeQuizPage() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const quizId = params?.id
  const itemId = search?.get('item') ?? null

  if (!quizId) return <p className="p-6 text-sm text-red-600">Missing quiz id.</p>
  return <QuizPlayer quizId={quizId} trainingItemId={itemId} />
}
