// src/types/quiz.ts
//
// Phase 6 (Quiz & Assessment Engine) shared types. Mirror the schema in
// supabase/migrations/045_quizzes.sql + 046_quiz_attempts.sql. Pure types only
// (no runtime imports) so they are safe to use from server, client, and tests.

export const QUESTION_TYPES = [
  'mc_single',
  'mc_multi',
  'true_false',
  'short_answer',
  'essay',
] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

/** Objective types are auto-graded against options on submit. */
export const OBJECTIVE_TYPES: QuestionType[] = ['mc_single', 'mc_multi', 'true_false']

export const FEEDBACK_TIMINGS = ['immediate', 'after_submit', 'after_close'] as const
export type FeedbackTiming = (typeof FEEDBACK_TIMINGS)[number]

export const QUIZ_STATUSES = ['draft', 'published', 'archived'] as const
export type QuizStatus = (typeof QUIZ_STATUSES)[number]

export const ATTEMPT_STATUSES = ['in_progress', 'submitted', 'graded'] as const
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]

export interface Quiz {
  id: string
  company_id: string
  title: string
  description: string | null
  passing_score: number
  attempt_limit: number | null
  randomize_questions: boolean
  time_limit_seconds: number | null
  feedback_timing: FeedbackTiming
  show_explanations: boolean
  status: QuizStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface QuizQuestion {
  id: string
  company_id: string
  quiz_id: string
  type: QuestionType
  prompt: string
  points: number
  explanation: string | null
  /** Accepted normalized answers for short_answer auto-grade; empty => manual. */
  accepted_answers: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

export interface QuizOption {
  id: string
  company_id: string
  question_id: string
  label: string
  is_correct: boolean
  sort_order: number
  created_at: string
}

/** A question with its options (options empty for non-option types). */
export interface QuizQuestionWithOptions extends QuizQuestion {
  options: QuizOption[]
}

/** Full quiz aggregate used by the builder + runtime. */
export interface QuizWithQuestions extends Quiz {
  questions: QuizQuestionWithOptions[]
}

export interface QuizAttempt {
  id: string
  company_id: string
  quiz_id: string
  employee_id: string
  training_item_id: string | null
  attempt_no: number
  status: AttemptStatus
  score: number | null
  passed: boolean | null
  started_at: string
  submitted_at: string | null
  graded_at: string | null
  time_spent_seconds: number
  created_at: string
  updated_at: string
}

export interface QuizAnswer {
  id: string
  company_id: string
  attempt_id: string
  question_id: string
  selected_option_ids: string[] | null
  text_answer: string | null
  awarded_points: number | null
  needs_manual: boolean
  grader_comment: string | null
  graded_by: string | null
  created_at: string
  updated_at: string
}

/** Client-submitted answer payload for a single question. */
export interface AnswerInput {
  question_id: string
  selected_option_ids?: string[] | null
  text_answer?: string | null
}

/** Builder-side draft shapes (ids optional for not-yet-persisted rows). */
export interface OptionDraft {
  id?: string
  label: string
  is_correct: boolean
  sort_order: number
}

export interface QuestionDraft {
  id?: string
  type: QuestionType
  prompt: string
  points: number
  explanation?: string | null
  accepted_answers: string[]
  sort_order: number
  options: OptionDraft[]
}

export interface QuizConfigInput {
  title: string
  description?: string | null
  passing_score: number
  attempt_limit?: number | null
  randomize_questions: boolean
  time_limit_seconds?: number | null
  feedback_timing: FeedbackTiming
  show_explanations: boolean
  status: QuizStatus
}
