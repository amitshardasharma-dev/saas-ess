// src/lib/quiz/schemas.ts
//
// Zod validation schemas for Phase 6 API payloads (no-code builder + runtime).
// Pure — imports only zod + the type constants.

import { z } from 'zod'
import {
  ATTEMPT_STATUSES,
  FEEDBACK_TIMINGS,
  QUESTION_TYPES,
  QUIZ_STATUSES,
} from '@/types/quiz'

export const optionSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1, 'Option label required'),
  is_correct: z.boolean(),
  sort_order: z.number().int().nonnegative().default(0),
})

export const questionSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().min(1, 'Question prompt required'),
    points: z.number().positive('Points must be > 0').default(1),
    explanation: z.string().nullish(),
    accepted_answers: z.array(z.string()).default([]),
    sort_order: z.number().int().nonnegative().default(0),
    options: z.array(optionSchema).default([]),
  })
  .superRefine((q, ctx) => {
    const needsOptions = q.type === 'mc_single' || q.type === 'mc_multi' || q.type === 'true_false'
    if (needsOptions) {
      if (q.options.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least two options required', path: ['options'] })
      }
      const correctCount = q.options.filter((o) => o.is_correct).length
      if (correctCount < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Mark at least one correct option', path: ['options'] })
      }
      if ((q.type === 'mc_single' || q.type === 'true_false') && correctCount > 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only one correct option allowed', path: ['options'] })
      }
    }
  })

export const quizConfigSchema = z.object({
  title: z.string().min(1, 'Title required'),
  description: z.string().nullish(),
  passing_score: z.number().min(0).max(100).default(70),
  attempt_limit: z.number().int().positive().nullish(),
  randomize_questions: z.boolean().default(false),
  time_limit_seconds: z.number().int().positive().nullish(),
  feedback_timing: z.enum(FEEDBACK_TIMINGS).default('after_submit'),
  show_explanations: z.boolean().default(true),
  status: z.enum(QUIZ_STATUSES).default('draft'),
})

/** Full quiz create/update payload: config + nested questions. */
export const quizUpsertSchema = quizConfigSchema.extend({
  questions: z.array(questionSchema).default([]),
})

/** Runtime: start an attempt (optionally tied to a training item). */
export const startAttemptSchema = z.object({
  quiz_id: z.string().uuid(),
  training_item_id: z.string().uuid().nullish(),
})

/** Runtime: a single submitted answer. */
export const answerInputSchema = z.object({
  question_id: z.string().uuid(),
  selected_option_ids: z.array(z.string().uuid()).nullish(),
  text_answer: z.string().nullish(),
})

/** Runtime: submit an attempt with all answers. */
export const submitAttemptSchema = z.object({
  answers: z.array(answerInputSchema).default([]),
  time_spent_seconds: z.number().int().nonnegative().optional(),
})

/** Grading: a single manual grade for one answer. */
export const gradeAnswerSchema = z.object({
  answer_id: z.string().uuid(),
  awarded_points: z.number().min(0),
  grader_comment: z.string().nullish(),
})

/** Grading: submit one or more manual grades for an attempt. */
export const gradeAttemptSchema = z.object({
  grades: z.array(gradeAnswerSchema).min(1),
})

export const attemptStatusSchema = z.enum(ATTEMPT_STATUSES)

export type QuizUpsertInput = z.infer<typeof quizUpsertSchema>
export type StartAttemptInput = z.infer<typeof startAttemptSchema>
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>
export type GradeAttemptInput = z.infer<typeof gradeAttemptSchema>
