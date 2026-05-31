'use client'

// Phase 6 — per-question editor used by the QuizBuilder. Renders the right inputs
// for each of the 5 question types: option lists with correct flags (mc/tf),
// accepted-answers for short_answer, and a manual-grade note for essay.

import type { OptionDraft, QuestionDraft } from '@/types/quiz'

export interface QuestionEditorProps {
  index: number
  question: QuestionDraft
  onChange: (q: QuestionDraft) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function QuestionEditor({
  index,
  question,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: QuestionEditorProps) {
  const hasOptions =
    question.type === 'mc_single' || question.type === 'mc_multi' || question.type === 'true_false'
  const isMultiSelect = question.type === 'mc_multi'

  function patch(p: Partial<QuestionDraft>) {
    onChange({ ...question, ...p })
  }

  function updateOption(i: number, p: Partial<OptionDraft>) {
    const options = question.options.map((o, oi) => (oi === i ? { ...o, ...p } : o))
    onChange({ ...question, options })
  }

  function setCorrect(i: number, checked: boolean) {
    let options: OptionDraft[]
    if (isMultiSelect) {
      options = question.options.map((o, oi) => (oi === i ? { ...o, is_correct: checked } : o))
    } else {
      // single-correct: selecting one clears the rest
      options = question.options.map((o, oi) => ({ ...o, is_correct: oi === i ? checked : false }))
    }
    onChange({ ...question, options })
  }

  function addOption() {
    onChange({
      ...question,
      options: [...question.options, { label: '', is_correct: false, sort_order: question.options.length }],
    })
  }

  function removeOption(i: number) {
    onChange({
      ...question,
      options: question.options.filter((_, oi) => oi !== i).map((o, oi) => ({ ...o, sort_order: oi })),
    })
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-gray-400">
          Q{index + 1} · {question.type}
        </span>
        <div className="space-x-2 text-xs">
          <button type="button" onClick={onMoveUp} className="text-gray-500 hover:underline">
            ↑
          </button>
          <button type="button" onClick={onMoveDown} className="text-gray-500 hover:underline">
            ↓
          </button>
          <button type="button" onClick={onRemove} className="text-red-600 hover:underline">
            Remove
          </button>
        </div>
      </div>

      <label className="block">
        <span className="text-sm">Prompt</span>
        <textarea
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          value={question.prompt}
          onChange={(e) => patch({ prompt: e.target.value })}
        />
      </label>

      <label className="block w-32">
        <span className="text-sm">Points</span>
        <input
          type="number"
          min={1}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          value={question.points}
          onChange={(e) => patch({ points: Number(e.target.value) })}
        />
      </label>

      {hasOptions && (
        <div className="space-y-2">
          <span className="text-sm font-medium">Options</span>
          {question.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={isMultiSelect ? 'checkbox' : 'radio'}
                name={`correct-${index}`}
                checked={o.is_correct}
                onChange={(e) => setCorrect(i, e.target.checked)}
              />
              <input
                className="flex-1 rounded-md border px-3 py-1.5 text-sm"
                placeholder={`Option ${i + 1}`}
                value={o.label}
                disabled={question.type === 'true_false'}
                onChange={(e) => updateOption(i, { label: e.target.value })}
              />
              {question.type !== 'true_false' && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-xs text-red-600 hover:underline"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {question.type !== 'true_false' && (
            <button type="button" onClick={addOption} className="text-xs text-blue-600 hover:underline">
              + Add option
            </button>
          )}
        </div>
      )}

      {question.type === 'short_answer' && (
        <label className="block">
          <span className="text-sm">Accepted answers (comma-separated; blank = manual grade)</span>
          <input
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={(question.accepted_answers ?? []).join(', ')}
            onChange={(e) =>
              patch({
                accepted_answers: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      )}

      {question.type === 'essay' && (
        <p className="text-xs text-gray-500">Essay answers are routed to the manual grading queue.</p>
      )}

      <label className="block">
        <span className="text-sm">Explanation (optional)</span>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          value={question.explanation ?? ''}
          onChange={(e) => patch({ explanation: e.target.value })}
        />
      </label>
    </div>
  )
}
