'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { quizService } from '@/services/quiz'
import type { QuizForRuntime } from '@/types/quiz'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

function TakeQuizInner({ quizId }: { quizId: string }) {
  // trainingItemId drives the post-pass recordQuizResult link (Phase 5).
  const search = useSearchParams()
  const _trainingItemId = search.get('trainingItemId')
  const router = useRouter()

  const [quiz, setQuiz] = useState<QuizForRuntime | null>(null)
  const [submitting] = useState(false)

  useEffect(() => {
    quizService
      .getQuizForRuntime(quizId)
      .then(setQuiz)
      .catch(() => toast.error('Failed to load quiz'))
  }, [quizId])

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">{quiz?.title ?? 'Quiz'}</h1>
      <p className="text-sm text-muted-foreground">Quiz runtime UI…</p>
      <Button disabled={submitting} onClick={() => router.push('/dashboard/training')}>
        Back to training
      </Button>
    </div>
  )
}

export default function TakeQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: quizId } = use(params)
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <TakeQuizInner quizId={quizId} />
    </Suspense>
  )
}
