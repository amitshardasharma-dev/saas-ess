// Phase 6 — auto-grading unit tests (pure; no Supabase/network imports).

import {
  computeScore,
  gradeAnswer,
  isAutoGradable,
  isPass,
  normalizeText,
  sameIdSet,
} from './grading'
import type { QuizQuestionWithOptions } from '@/types/quiz'

function q(partial: Partial<QuizQuestionWithOptions>): QuizQuestionWithOptions {
  return {
    id: 'q1',
    company_id: 'c1',
    quiz_id: 'quiz1',
    type: 'mc_single',
    prompt: 'p',
    points: 1,
    explanation: null,
    accepted_answers: [],
    sort_order: 0,
    created_at: '',
    updated_at: '',
    options: [],
    ...partial,
  }
}

describe('sameIdSet', () => {
  it('is order-independent and dedup-safe', () => {
    expect(sameIdSet(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameIdSet(['a', 'a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameIdSet(['a'], ['a', 'b'])).toBe(false)
    expect(sameIdSet([], [])).toBe(true)
  })
})

describe('normalizeText', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeText('  Hello   World ')).toBe('hello world')
  })
})

describe('gradeAnswer — mc_single / true_false', () => {
  const question = q({
    type: 'mc_single',
    points: 2,
    options: [
      { id: 'o1', company_id: 'c1', question_id: 'q1', label: 'A', is_correct: true, sort_order: 0, created_at: '' },
      { id: 'o2', company_id: 'c1', question_id: 'q1', label: 'B', is_correct: false, sort_order: 1, created_at: '' },
    ],
  })

  it('awards full points for the single correct option', () => {
    const g = gradeAnswer(question, { question_id: 'q1', selected_option_ids: ['o1'] })
    expect(g.correct).toBe(true)
    expect(g.awarded_points).toBe(2)
    expect(g.needs_manual).toBe(false)
  })

  it('awards zero for a wrong selection', () => {
    const g = gradeAnswer(question, { question_id: 'q1', selected_option_ids: ['o2'] })
    expect(g.correct).toBe(false)
    expect(g.awarded_points).toBe(0)
  })

  it('awards zero when multiple options are selected', () => {
    const g = gradeAnswer(question, { question_id: 'q1', selected_option_ids: ['o1', 'o2'] })
    expect(g.correct).toBe(false)
  })
})

describe('gradeAnswer — mc_multi requires exact set', () => {
  const question = q({
    type: 'mc_multi',
    points: 3,
    options: [
      { id: 'o1', company_id: 'c1', question_id: 'q1', label: 'A', is_correct: true, sort_order: 0, created_at: '' },
      { id: 'o2', company_id: 'c1', question_id: 'q1', label: 'B', is_correct: true, sort_order: 1, created_at: '' },
      { id: 'o3', company_id: 'c1', question_id: 'q1', label: 'C', is_correct: false, sort_order: 2, created_at: '' },
    ],
  })

  it('full points only for the exact correct set', () => {
    expect(gradeAnswer(question, { question_id: 'q1', selected_option_ids: ['o1', 'o2'] }).awarded_points).toBe(3)
  })

  it('partial selection scores zero (no partial credit)', () => {
    expect(gradeAnswer(question, { question_id: 'q1', selected_option_ids: ['o1'] }).awarded_points).toBe(0)
  })

  it('superset selection scores zero', () => {
    expect(
      gradeAnswer(question, { question_id: 'q1', selected_option_ids: ['o1', 'o2', 'o3'] }).awarded_points
    ).toBe(0)
  })
})

describe('gradeAnswer — short_answer', () => {
  it('auto-grades against accepted_answers (normalized)', () => {
    const question = q({ type: 'short_answer', points: 1, accepted_answers: ['Safeguarding'] })
    expect(gradeAnswer(question, { question_id: 'q1', text_answer: ' safeguarding ' }).awarded_points).toBe(1)
    expect(gradeAnswer(question, { question_id: 'q1', text_answer: 'wrong' }).awarded_points).toBe(0)
  })

  it('routes to manual when no accepted_answers configured', () => {
    const question = q({ type: 'short_answer', accepted_answers: [] })
    const g = gradeAnswer(question, { question_id: 'q1', text_answer: 'anything' })
    expect(g.needs_manual).toBe(true)
    expect(g.awarded_points).toBeNull()
  })
})

describe('gradeAnswer — essay always manual', () => {
  it('flags needs_manual with null points', () => {
    const question = q({ type: 'essay', points: 5 })
    const g = gradeAnswer(question, { question_id: 'q1', text_answer: 'long answer' })
    expect(g.needs_manual).toBe(true)
    expect(g.awarded_points).toBeNull()
  })
})

describe('isAutoGradable', () => {
  it('objective types and configured short answers are auto-gradable; essay is not', () => {
    expect(isAutoGradable(q({ type: 'mc_single' }))).toBe(true)
    expect(isAutoGradable(q({ type: 'mc_multi' }))).toBe(true)
    expect(isAutoGradable(q({ type: 'true_false' }))).toBe(true)
    expect(isAutoGradable(q({ type: 'short_answer', accepted_answers: ['x'] }))).toBe(true)
    expect(isAutoGradable(q({ type: 'short_answer', accepted_answers: [] }))).toBe(false)
    expect(isAutoGradable(q({ type: 'essay' }))).toBe(false)
  })
})

describe('computeScore + isPass', () => {
  const questions = [
    { id: 'q1', points: 2 },
    { id: 'q2', points: 3 },
    { id: 'q3', points: 5 },
  ]

  it('reports fullyGraded=false while a manual answer is pending', () => {
    const awarded = new Map<string, number | null>([
      ['q1', 2],
      ['q2', 0],
      ['q3', null],
    ])
    const r = computeScore(questions, awarded)
    expect(r.fullyGraded).toBe(false)
    expect(r.totalPoints).toBe(10)
    // pending essay excluded from awarded sum
    expect(r.awardedPoints).toBe(2)
  })

  it('computes a percentage and pass/fail once fully graded', () => {
    const awarded = new Map<string, number | null>([
      ['q1', 2],
      ['q2', 3],
      ['q3', 2],
    ])
    const r = computeScore(questions, awarded)
    expect(r.fullyGraded).toBe(true)
    expect(r.awardedPoints).toBe(7)
    expect(r.scorePercent).toBe(70)
    expect(isPass(r.scorePercent, 70)).toBe(true)
    expect(isPass(r.scorePercent, 71)).toBe(false)
  })

  it('handles zero-point quizzes without dividing by zero', () => {
    const r = computeScore([], new Map())
    expect(r.scorePercent).toBe(0)
    expect(r.fullyGraded).toBe(true)
  })
})
