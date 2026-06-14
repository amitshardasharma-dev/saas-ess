'use client'

export const dynamic = 'force-dynamic'

// Phase 6 — take-quiz runtime, launched from a training item. The route param is
// the quiz id; an optional ?item= query param carries the launching training
// item id so a graded pass/fail feeds back into Phase 5 training completion.

import { Suspense, use } from 'react'
import { useSearchParams } from 'next/navigation'
import QuizPlayer from '@/components/quizzes/QuizPlayer'

function TakeQuizInner({ quizId }: { quizId: string }) {
  const search = useSearchParams()
  const itemId = search?.get('item') ?? search?.get('trainingItemId') ?? null
  if (!quizId) return <p className="p-6 text-sm text-red-600">Missing quiz id.</p>
  return <QuizPlayer quizId={quizId} trainingItemId={itemId} />
}

export default function TakeQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: quizId } = use(params)
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <TakeQuizInner quizId={quizId} />
    </Suspense>
  )
}
