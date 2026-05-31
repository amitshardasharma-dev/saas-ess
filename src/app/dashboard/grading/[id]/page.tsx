'use client'

// Phase 6 — grade a single attempt. Staff/Admin only. Shows each question with
// the volunteer's answer; auto-graded answers are read-only, manual ones take a
// points input + optional comment. Submitting recomputes pass/fail and (when the
// last pending answer is graded) feeds Phase 5 training completion.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { gradeAttempt, getGradingAttempt } from '@/services/quiz'
import type { QuizAnswer, QuizAttempt, QuizWithQuestions } from '@/types/quiz'

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
    async function load() {
      try {
        setData(await getGradingAttempt(attemptId!))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load attempt')
      }
    }
    void load()
  }, [attemptId])

  async function submit() {
    if (!data || !attemptId) return
    const pending = data.answers.filter((a) => a.needs_manual)
    const grades = pending.map((a) => ({
      answer_id: a.id,
      awarded_points: points[a.id] ?? 0,
      grader_comment: comments[a.id] ?? null,
    }))
    if (grades.length === 0) {
      toast('Nothing to grade')
      return
    }
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

  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>
  if (!data) return <p className="p-6 text-sm text-gray-500">Loading…</p>

  const questionById = new Map((data.quiz?.questions ?? []).map((q) => [q.id, q]))

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Grade: {data.quiz?.title ?? 'Quiz'}</h1>

      {data.answers.map((a) => {
        const q = questionById.get(a.question_id)
        const manual = a.needs_manual
        return (
          <div key={a.id} className="space-y-2 rounded-md border p-4">
            <p className="font-medium">{q?.prompt ?? 'Question'}</p>
            <p className="whitespace-pre-wrap rounded bg-gray-50 p-2 text-sm text-gray-700">
              {a.text_answer || (a.selected_option_ids?.length ? `(selected ${a.selected_option_ids.length})` : '—')}
            </p>
            {manual ? (
              <div className="space-y-2">
                <label className="block w-40">
                  <span className="text-sm">Points (max {q?.points ?? '—'})</span>
                  <input
                    type="number"
                    min={0}
                    max={q?.points}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={points[a.id] ?? ''}
                    onChange={(e) => setPoints((p) => ({ ...p, [a.id]: Number(e.target.value) }))}
                  />
                </label>
                <label className="block">
                  <span className="text-sm">Comment</span>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={comments[a.id] ?? ''}
                    onChange={(e) => setComments((c) => ({ ...c, [a.id]: e.target.value }))}
                  />
                </label>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Auto-graded: {a.awarded_points ?? 0} pt{(a.awarded_points ?? 0) === 1 ? '' : 's'}
              </p>
            )}
          </div>
        )
      })}

      <button
        type="button"
        disabled={saving}
        onClick={submit}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save grades'}
      </button>
    </div>
  )
}
