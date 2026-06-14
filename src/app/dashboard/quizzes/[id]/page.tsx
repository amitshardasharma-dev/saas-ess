'use client'

// Phase 6 — edit an existing quiz. Loads the aggregate, maps it to a builder
// draft, and renders the shared QuizBuilder.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import QuizBuilder from '@/components/quizzes/QuizBuilder'
import { getQuiz } from '@/services/quiz'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-sm">
            <AlertCircle className="h-10 w-10 text-destructive/70" />
            <p className="text-muted-foreground">{error}</p>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link href="/dashboard/quizzes">Back to quizzes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  if (!initial) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading quiz…
          </CardContent>
        </Card>
      </div>
    )
  }
  return <QuizBuilder quizId={id} initial={initial} />
}
