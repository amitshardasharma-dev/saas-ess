// src/lib/quiz/grading.ts
//
// Pure auto-grading logic for Phase 6. No Supabase / network imports so it is
// fully unit-testable and safe to import from anywhere.
//
// Grading model:
//   - mc_single / true_false : correct iff the single selected option is the
//     (only) correct option. Awards full points or zero.
//   - mc_multi               : correct iff the selected set EXACTLY equals the
//     correct set (no partial credit). Awards full points or zero.
//   - short_answer           : if the question has accepted_answers, auto-grade
//     by normalized match (case/space-insensitive); otherwise -> manual.
//   - essay                  : always manual.

import {
  OBJECTIVE_TYPES,
  type AnswerInput,
  type QuizQuestionWithOptions,
} from '@/types/quiz'

export interface GradedAnswer {
  question_id: string
  awarded_points: number | null
  needs_manual: boolean
  /** True when objective grading marked the answer correct (full points). */
  correct: boolean | null
}

/** Normalize a free-text answer for comparison: trim, collapse spaces, lowercase. */
export function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Set equality over string id arrays (order-independent, dedup-safe). */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const x of sa) {
    if (!sb.has(x)) return false
  }
  return true
}

/** Is this question type auto-gradable (given its config)? */
export function isAutoGradable(q: QuizQuestionWithOptions): boolean {
  if (OBJECTIVE_TYPES.includes(q.type)) return true
  if (q.type === 'short_answer') return (q.accepted_answers?.length ?? 0) > 0
  return false // essay
}

/**
 * Grade a single answer against its question. Returns awarded_points (null when
 * the answer must be graded manually) + needs_manual + correctness.
 */
export function gradeAnswer(
  question: QuizQuestionWithOptions,
  answer: AnswerInput | undefined
): GradedAnswer {
  const selected = answer?.selected_option_ids ?? []
  const text = answer?.text_answer ?? ''

  switch (question.type) {
    case 'mc_single':
    case 'true_false': {
      const correctIds = question.options.filter((o) => o.is_correct).map((o) => o.id)
      // Exactly one selection that is the correct option.
      const correct = selected.length === 1 && correctIds.includes(selected[0])
      return {
        question_id: question.id,
        awarded_points: correct ? question.points : 0,
        needs_manual: false,
        correct,
      }
    }
    case 'mc_multi': {
      const correctIds = question.options.filter((o) => o.is_correct).map((o) => o.id)
      const correct = sameIdSet(selected, correctIds)
      return {
        question_id: question.id,
        awarded_points: correct ? question.points : 0,
        needs_manual: false,
        correct,
      }
    }
    case 'short_answer': {
      const accepted = question.accepted_answers ?? []
      if (accepted.length === 0) {
        return { question_id: question.id, awarded_points: null, needs_manual: true, correct: null }
      }
      const norm = normalizeText(text)
      const correct = norm.length > 0 && accepted.some((a) => normalizeText(a) === norm)
      return {
        question_id: question.id,
        awarded_points: correct ? question.points : 0,
        needs_manual: false,
        correct,
      }
    }
    case 'essay':
    default:
      return { question_id: question.id, awarded_points: null, needs_manual: true, correct: null }
  }
}

export interface ScoreResult {
  /** Sum of points across all questions. */
  totalPoints: number
  /** Sum of awarded points across answers graded so far (manual = 0 until set). */
  awardedPoints: number
  /** Percentage 0-100 of awarded/total. */
  scorePercent: number
  /** True once every answer has a non-null awarded_points (no pending manual). */
  fullyGraded: boolean
}

/**
 * Compute a score from per-question max points + per-answer awarded points.
 * `awardedByQuestion` maps question_id -> awarded_points (null = pending manual).
 */
export function computeScore(
  questions: Array<Pick<QuizQuestionWithOptions, 'id' | 'points'>>,
  awardedByQuestion: Map<string, number | null>
): ScoreResult {
  let totalPoints = 0
  let awardedPoints = 0
  let fullyGraded = true

  for (const q of questions) {
    totalPoints += q.points
    const awarded = awardedByQuestion.get(q.id)
    if (awarded == null) {
      fullyGraded = false
    } else {
      awardedPoints += awarded
    }
  }

  const scorePercent = totalPoints > 0 ? (awardedPoints / totalPoints) * 100 : 0
  return { totalPoints, awardedPoints, scorePercent, fullyGraded }
}

/** A score passes when it meets or exceeds the quiz passing_score. */
export function isPass(scorePercent: number, passingScore: number): boolean {
  return scorePercent >= passingScore
}
