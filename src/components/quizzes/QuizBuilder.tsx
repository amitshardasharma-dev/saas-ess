'use client'

// Phase 6 — no-code quiz builder. Pure-UI editor over a QuizUpsertInput draft:
// configure quiz settings, add/remove/reorder questions of every type, edit
// options + correct flags, and persist via the create/update services. Validated
// with the same Zod schema the API uses (client-side pre-check).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  FEEDBACK_TIMINGS,
  QUESTION_TYPES,
  QUIZ_STATUSES,
  type FeedbackTiming,
  type QuestionDraft,
  type QuestionType,
  type QuizStatus,
} from '@/types/quiz'
import { quizUpsertSchema, type QuizUpsertInput } from '@/lib/quiz/schemas'
import { createQuiz, updateQuiz } from '@/services/quiz'
import { QuestionEditor } from './QuestionEditor'

export interface QuizBuilderProps {
  quizId?: string
  initial?: QuizUpsertInput
}

function emptyDraft(): QuizUpsertInput {
  return {
    title: '',
    description: '',
    passing_score: 70,
    attempt_limit: null,
    randomize_questions: false,
    time_limit_seconds: null,
    feedback_timing: 'after_submit',
    show_explanations: true,
    status: 'draft',
    questions: [],
  }
}

export function newQuestion(type: QuestionType, sortOrder: number): QuestionDraft {
  const base: QuestionDraft = {
    type,
    prompt: '',
    points: 1,
    explanation: '',
    accepted_answers: [],
    sort_order: sortOrder,
    options: [],
  }
  if (type === 'true_false') {
    base.options = [
      { label: 'True', is_correct: true, sort_order: 0 },
      { label: 'False', is_correct: false, sort_order: 1 },
    ]
  } else if (type === 'mc_single' || type === 'mc_multi') {
    base.options = [
      { label: '', is_correct: false, sort_order: 0 },
      { label: '', is_correct: false, sort_order: 1 },
    ]
  }
  return base
}

export default function QuizBuilder({ quizId, initial }: QuizBuilderProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<QuizUpsertInput>(initial ?? emptyDraft())
  const [saving, setSaving] = useState(false)
  const [addType, setAddType] = useState<QuestionType>('mc_single')

  function patch(p: Partial<QuizUpsertInput>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function updateQuestion(index: number, q: QuestionDraft) {
    setDraft((d) => {
      const questions = d.questions.slice()
      questions[index] = q
      return { ...d, questions }
    })
  }

  function removeQuestion(index: number) {
    setDraft((d) => {
      const questions = d.questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i }))
      return { ...d, questions }
    })
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const questions = d.questions.slice()
      const target = index + dir
      if (target < 0 || target >= questions.length) return d
      ;[questions[index], questions[target]] = [questions[target], questions[index]]
      return { ...d, questions: questions.map((q, i) => ({ ...q, sort_order: i })) }
    })
  }

  function addQuestion() {
    setDraft((d) => ({
      ...d,
      questions: [...d.questions, newQuestion(addType, d.questions.length)],
    }))
  }

  async function save() {
    const parsed = quizUpsertSchema.safeParse(draft)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      toast.error(first ? `${first.path.join('.')}: ${first.message}` : 'Validation failed')
      return
    }
    setSaving(true)
    try {
      if (quizId) {
        await updateQuiz(quizId, parsed.data)
        toast.success('Quiz saved')
      } else {
        const { id } = await createQuiz(parsed.data)
        toast.success('Quiz created')
        router.push(`/dashboard/quizzes/${id}`)
        return
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold">{quizId ? 'Edit Quiz' : 'New Quiz'}</h1>

      {/* Config */}
      <section className="space-y-4 rounded-md border p-4">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Settings</h2>
        <label className="block">
          <span className="text-sm">Title</span>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-sm">Description</span>
          <textarea
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={draft.description ?? ''}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm">Passing score (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={draft.passing_score}
              onChange={(e) => patch({ passing_score: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="text-sm">Attempt limit (blank = unlimited)</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={draft.attempt_limit ?? ''}
              onChange={(e) =>
                patch({ attempt_limit: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label className="block">
            <span className="text-sm">Time limit (minutes, blank = none)</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={draft.time_limit_seconds ? Math.round(draft.time_limit_seconds / 60) : ''}
              onChange={(e) =>
                patch({
                  time_limit_seconds: e.target.value === '' ? null : Number(e.target.value) * 60,
                })
              }
            />
          </label>
          <label className="block">
            <span className="text-sm">Feedback timing</span>
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={draft.feedback_timing}
              onChange={(e) => patch({ feedback_timing: e.target.value as FeedbackTiming })}
            >
              {FEEDBACK_TIMINGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm">Status</span>
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={draft.status}
              onChange={(e) => patch({ status: e.target.value as QuizStatus })}
            >
              {QUIZ_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.randomize_questions}
              onChange={(e) => patch({ randomize_questions: e.target.checked })}
            />
            Randomize question order
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.show_explanations}
              onChange={(e) => patch({ show_explanations: e.target.checked })}
            />
            Show explanations
          </label>
        </div>
      </section>

      {/* Questions */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Questions</h2>
        {draft.questions.map((q, i) => (
          <QuestionEditor
            key={i}
            index={i}
            question={q as QuestionDraft}
            onChange={(updated) => updateQuestion(i, updated)}
            onRemove={() => removeQuestion(i)}
            onMoveUp={() => moveQuestion(i, -1)}
            onMoveDown={() => moveQuestion(i, 1)}
          />
        ))}

        <div className="flex items-center gap-2">
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={addType}
            onChange={(e) => setAddType(e.target.value as QuestionType)}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addQuestion}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Add question
          </button>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save quiz'}
        </button>
      </div>
    </div>
  )
}
