'use client'

export const dynamic = 'force-dynamic'

// Phase 6 — take-quiz runtime, launched from a training item. The route param is
// the quiz id; an optional ?item= query param carries the launching training
// item id so a graded pass/fail feeds back into Phase 5 training completion.

import { Suspense, use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'
import QuizPlayer from '@/components/quizzes/QuizPlayer'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function TakeQuizInner({ quizId }: { quizId: string }) {
  const search = useSearchParams()
  const itemId = search?.get('item') ?? search?.get('trainingItemId') ?? null
  if (!quizId) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm">
            <AlertTriangle className="h-10 w-10 text-destructive/70" />
            <p className="text-muted-foreground">This quiz link is missing its quiz id.</p>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/dashboard/training">Back to training</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  return <QuizPlayer quizId={quizId} trainingItemId={itemId} />
}

function LoadingState() {
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    </div>
  )
}

export default function TakeQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: quizId } = use(params)
  return (
    <Suspense fallback={<LoadingState />}>
      <TakeQuizInner quizId={quizId} />
    </Suspense>
  )
}
