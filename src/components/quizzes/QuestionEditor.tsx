'use client'

// Phase 6 — per-question editor used by the QuizBuilder. Renders the right inputs
// for each of the 5 question types:
//   mc_single   — radio per option (exactly one correct)
//   mc_multi    — checkbox per option (one or more correct)
//   true_false  — fixed True/False options, pick which is correct
//   short_answer— free-text with a list of accepted answers (chips); empty => manual
//   essay       — free-text routed to the manual grading queue
// Plus per-question points, an optional explanation, and reorder / duplicate /
// delete affordances. Pure UI over a QuestionDraft — no I/O, no grading logic.

import { useState } from 'react'
import {
  AlignLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Copy,
  GripVertical,
  Lightbulb,
  ListChecks,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { OptionDraft, QuestionDraft, QuestionType } from '@/types/quiz'

export interface QuestionEditorProps {
  index: number
  total: number
  question: QuestionDraft
  /** Validation issue messages keyed by short field name, for this question. */
  issues?: Record<string, string>
  onChange: (q: QuestionDraft) => void
  onRemove: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export const QUESTION_TYPE_META: Record<
  QuestionType,
  { label: string; hint: string; icon: React.ComponentType<{ className?: string }> }
> = {
  mc_single: { label: 'Multiple choice', hint: 'One correct answer', icon: CircleDot },
  mc_multi: { label: 'Multiple select', hint: 'One or more correct answers', icon: ListChecks },
  true_false: { label: 'True / False', hint: 'Pick the correct statement', icon: ToggleLeft },
  short_answer: { label: 'Short answer', hint: 'Auto-graded against accepted answers', icon: Type },
  essay: { label: 'Essay', hint: 'Manually graded', icon: AlignLeft },
}

export function QuestionEditor({
  index,
  total,
  question,
  issues,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: QuestionEditorProps) {
  const [collapsed, setCollapsed] = useState(false)
  const meta = QUESTION_TYPE_META[question.type]
  const Icon = meta.icon
  const hasOptions =
    question.type === 'mc_single' || question.type === 'mc_multi' || question.type === 'true_false'
  const isMultiSelect = question.type === 'mc_multi'
  const lockedOptions = question.type === 'true_false'

  function patch(p: Partial<QuestionDraft>) {
    onChange({ ...question, ...p })
  }

  function updateOption(i: number, p: Partial<OptionDraft>) {
    onChange({ ...question, options: question.options.map((o, oi) => (oi === i ? { ...o, ...p } : o)) })
  }

  function setCorrect(i: number, checked: boolean) {
    const options = isMultiSelect
      ? question.options.map((o, oi) => (oi === i ? { ...o, is_correct: checked } : o))
      : // single-correct: selecting one clears the rest
        question.options.map((o, oi) => ({ ...o, is_correct: oi === i ? checked : false }))
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

  const summary = question.prompt.trim() || 'Untitled question'
  const correctCount = question.options.filter((o) => o.is_correct).length

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header: handle, index, type, points, actions */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          Q{index + 1}
        </Badge>
        <Badge variant="outline" className="shrink-0 gap-1">
          <Icon className="h-3 w-3" /> {meta.label}
        </Badge>
        {collapsed ? (
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{summary}</span>
        ) : (
          <span className="flex-1" />
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move question up"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move question down"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onDuplicate}
            aria-label="Duplicate question"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Delete question"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand question' : 'Collapse question'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-4 p-4">
          {/* Prompt */}
          <div className="space-y-1.5">
            <Label className="text-sm">Question prompt</Label>
            <Textarea
              value={question.prompt}
              placeholder="What do you want to ask?"
              onChange={(e) => patch({ prompt: e.target.value })}
              className={issues?.prompt ? 'border-destructive' : ''}
              rows={2}
            />
            {issues?.prompt ? <p className="text-xs text-destructive">{issues.prompt}</p> : null}
          </div>

          {/* Options (mc_single / mc_multi / true_false) */}
          {hasOptions && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Answer options</Label>
                <span className="text-xs text-muted-foreground">
                  {isMultiSelect ? 'Tick every correct answer' : 'Select the one correct answer'}
                </span>
              </div>
              <div className="space-y-2">
                {question.options.map((o, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                      o.is_correct ? 'border-green-300 bg-green-50/60' : 'bg-background'
                    }`}
                  >
                    <label className="flex shrink-0 cursor-pointer items-center" title="Mark correct">
                      <input
                        type={isMultiSelect ? 'checkbox' : 'radio'}
                        name={`correct-${index}`}
                        checked={o.is_correct}
                        onChange={(e) => setCorrect(i, e.target.checked)}
                        className="h-4 w-4 accent-green-600"
                      />
                    </label>
                    <Input
                      value={o.label}
                      placeholder={`Option ${i + 1}`}
                      disabled={lockedOptions}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                      className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                    {o.is_correct ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label="Correct answer" />
                    ) : null}
                    {!lockedOptions && question.options.length > 2 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeOption(i)}
                        aria-label={`Remove option ${i + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              {issues?.options ? <p className="text-xs text-destructive">{issues.options}</p> : null}
              {correctCount === 0 ? (
                <p className="text-xs text-amber-600">Mark at least one option as correct.</p>
              ) : null}
              {!lockedOptions && (
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="h-3.5 w-3.5" /> Add option
                </Button>
              )}
            </div>
          )}

          {/* Short answer accepted answers */}
          {question.type === 'short_answer' && (
            <AcceptedAnswersEditor
              values={question.accepted_answers ?? []}
              onChange={(accepted_answers) => patch({ accepted_answers })}
            />
          )}

          {/* Essay note */}
          {question.type === 'essay' && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <AlignLeft className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Essay responses can&apos;t be auto-graded — every submission is routed to the manual grading
                queue, where a reviewer awards points up to the maximum below.
              </span>
            </div>
          )}

          {/* Points + explanation */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-1.5">
              <Label className="text-sm">Points</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={question.points}
                onChange={(e) => patch({ points: Math.max(1, Number(e.target.value) || 1) })}
                className={issues?.points ? 'border-destructive' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" /> Explanation
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                value={question.explanation ?? ''}
                placeholder="Shown as feedback after the answer, per the quiz's feedback timing"
                onChange={(e) => patch({ explanation: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- accepted answers (chips) ---------- */

function AcceptedAnswersEditor({
  values,
  onChange,
}: {
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function commit() {
    const v = draft.trim()
    if (!v) return
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">Accepted answers</Label>
      <p className="text-xs text-muted-foreground">
        Matching is case- and spacing-insensitive. Leave empty to grade this question manually.
      </p>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {values.map((v, i) => (
            <Badge key={`${v}-${i}`} variant="secondary" className="gap-1 pr-1">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, vi) => vi !== i))}
                className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remove accepted answer ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2 pt-1">
        <Input
          value={draft}
          placeholder="Type an accepted answer and press Enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            }
          }}
        />
        <Button type="button" variant="outline" onClick={commit} disabled={!draft.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  )
}
