// Phase 6 — randomization unit tests (pure). Crucially: a shuffled presentation
// order must NOT change grading, because grading matches answers to questions by
// id. We assert the shuffle is a stable permutation seeded by the attempt id.

import { gradeAnswer } from './grading'
import { orderQuestions, seededShuffle } from './randomize'
import type { AnswerInput, QuizQuestionWithOptions } from '@/types/quiz'

describe('seededShuffle', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8]

  it('is deterministic for the same seed', () => {
    expect(seededShuffle(items, 123)).toEqual(seededShuffle(items, 123))
  })
  it('preserves the multiset of items (a permutation)', () => {
    const out = seededShuffle(items, 999)
    expect(out.slice().sort((a, b) => a - b)).toEqual(items)
  })
  it('different seeds usually differ', () => {
    expect(seededShuffle(items, 1)).not.toEqual(seededShuffle(items, 2))
  })
})

describe('orderQuestions', () => {
  const qs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as Array<{ id: string }>

  it('preserves order when randomize is false', () => {
    expect(orderQuestions(qs, false, 'attempt-1').map((q) => q.id)).toEqual(['a', 'b', 'c'])
  })
  it('is stable per attempt id', () => {
    const a = orderQuestions(qs, true, 'attempt-1')
    const b = orderQuestions(qs, true, 'attempt-1')
    expect(a).toEqual(b)
  })
})

describe('randomization does not affect grading', () => {
  function mc(id: string, correctId: string): QuizQuestionWithOptions {
    return {
      id,
      company_id: 'c1',
      quiz_id: 'quiz1',
      type: 'mc_single',
      prompt: id,
      points: 1,
      explanation: null,
      accepted_answers: [],
      sort_order: 0,
      created_at: '',
      updated_at: '',
      options: [
        { id: `${id}-${correctId}`, company_id: 'c1', question_id: id, label: 'right', is_correct: true, sort_order: 0, created_at: '' },
        { id: `${id}-x`, company_id: 'c1', question_id: id, label: 'wrong', is_correct: false, sort_order: 1, created_at: '' },
      ],
    }
  }

  it('grades each question by id regardless of presentation order', () => {
    const questions = [mc('q1', 'r'), mc('q2', 'r'), mc('q3', 'r')]
    const answers: Record<string, AnswerInput> = {
      q1: { question_id: 'q1', selected_option_ids: ['q1-r'] },
      q2: { question_id: 'q2', selected_option_ids: ['q2-x'] }, // wrong
      q3: { question_id: 'q3', selected_option_ids: ['q3-r'] },
    }
    const ordered = orderQuestions(questions, true, 'attempt-xyz')
    const score = ordered.map((q) => gradeAnswer(q, answers[q.id]).awarded_points)
    // Two correct (q1, q3), one wrong (q2) — independent of order.
    expect(score.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(2)
  })
})
