// src/lib/quiz/server.ts
//
// Server-side quiz persistence + grading orchestration for Phase 6. Touches the
// DB via supabaseAdmin (tenant scoping enforced by always filtering company_id)
// and wires graded pass/fail back into Phase 5 training completion.
//
// Pure logic (set math, scoring, timing, randomization) lives in the sibling
// modules and is unit-tested independently; this file is the I/O shell.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordQuizResult } from '@/lib/training'
import { computeScore, gradeAnswer, isPass, type GradedAnswer } from './grading'
import type {
  AnswerInput,
  Quiz,
  QuizAnswer,
  QuizAttempt,
  QuizOption,
  QuizQuestion,
  QuizQuestionWithOptions,
  QuizWithQuestions,
} from '@/types/quiz'
import type { QuizUpsertInput } from './schemas'

/** Load a quiz (tenant-scoped) with its questions + options ordered. Null if absent. */
export async function loadQuizWithQuestions(
  companyId: string,
  quizId: string
): Promise<QuizWithQuestions | null> {
  const { data: quiz } = await supabaseAdmin
    .from('ess_quizzes')
    .select('*')
    .eq('id', quizId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!quiz) return null

  const { data: questionRows } = await supabaseAdmin
    .from('ess_quiz_questions')
    .select('*')
    .eq('quiz_id', quizId)
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })

  const qList = (questionRows ?? []) as QuizQuestion[]
  const qIds = qList.map((q) => q.id)

  const optionsByQuestion = new Map<string, QuizOption[]>()
  if (qIds.length > 0) {
    const { data: optionRows } = await supabaseAdmin
      .from('ess_quiz_options')
      .select('*')
      .in('question_id', qIds)
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
    for (const opt of (optionRows ?? []) as QuizOption[]) {
      const arr = optionsByQuestion.get(opt.question_id) ?? []
      arr.push(opt)
      optionsByQuestion.set(opt.question_id, arr)
    }
  }

  const questions: QuizQuestionWithOptions[] = qList.map((q) => ({
    ...q,
    options: optionsByQuestion.get(q.id) ?? [],
  }))

  return { ...(quiz as Quiz), questions }
}

/**
 * Persist a quiz aggregate (config + questions + options). When `quizId` is given
 * it REPLACES the existing questions/options (delete + re-insert) for that quiz;
 * otherwise a new quiz is created. Returns the quiz id.
 */
export async function saveQuizAggregate(
  companyId: string,
  input: QuizUpsertInput,
  createdBy: string | null,
  quizId?: string
): Promise<string> {
  const config = {
    company_id: companyId,
    title: input.title,
    description: input.description ?? null,
    passing_score: input.passing_score,
    attempt_limit: input.attempt_limit ?? null,
    randomize_questions: input.randomize_questions,
    time_limit_seconds: input.time_limit_seconds ?? null,
    feedback_timing: input.feedback_timing,
    show_explanations: input.show_explanations,
    status: input.status,
  }

  let id = quizId
  if (id) {
    const { error } = await supabaseAdmin
      .from('ess_quizzes')
      .update(config)
      .eq('id', id)
      .eq('company_id', companyId)
    if (error) throw new Error(`quiz update failed: ${error.message}`)
    // Replace questions (cascade removes options).
    await supabaseAdmin
      .from('ess_quiz_questions')
      .delete()
      .eq('quiz_id', id)
      .eq('company_id', companyId)
  } else {
    const { data, error } = await supabaseAdmin
      .from('ess_quizzes')
      .insert({ ...config, created_by: createdBy })
      .select('id')
      .single()
    if (error || !data) throw new Error(`quiz create failed: ${error?.message}`)
    id = data.id as string
  }

  await insertQuestions(companyId, id, input.questions)
  return id
}

/** Insert questions + their options for a quiz. */
async function insertQuestions(
  companyId: string,
  quizId: string,
  questions: QuizUpsertInput['questions']
): Promise<void> {
  let sort = 0
  for (const q of questions) {
    const { data: qRow, error: qErr } = await supabaseAdmin
      .from('ess_quiz_questions')
      .insert({
        company_id: companyId,
        quiz_id: quizId,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        explanation: q.explanation ?? null,
        accepted_answers: q.accepted_answers ?? [],
        sort_order: q.sort_order ?? sort,
      })
      .select('id')
      .single()
    if (qErr || !qRow) throw new Error(`question insert failed: ${qErr?.message}`)

    if (q.options.length > 0) {
      const optionRows = q.options.map((o, i) => ({
        company_id: companyId,
        question_id: qRow.id as string,
        label: o.label,
        is_correct: o.is_correct,
        sort_order: o.sort_order ?? i,
      }))
      const { error: oErr } = await supabaseAdmin.from('ess_quiz_options').insert(optionRows)
      if (oErr) throw new Error(`option insert failed: ${oErr.message}`)
    }
    sort++
  }
}

/** Deep-copy a quiz (+ questions + options) into a new draft quiz. Returns the new id. */
export async function duplicateQuiz(
  companyId: string,
  quizId: string,
  createdBy: string | null
): Promise<string | null> {
  const src = await loadQuizWithQuestions(companyId, quizId)
  if (!src) return null

  return saveQuizAggregate(
    companyId,
    {
      title: `${src.title} (Copy)`,
      description: src.description,
      passing_score: src.passing_score,
      attempt_limit: src.attempt_limit,
      randomize_questions: src.randomize_questions,
      time_limit_seconds: src.time_limit_seconds,
      feedback_timing: src.feedback_timing,
      show_explanations: src.show_explanations,
      status: 'draft',
      questions: src.questions.map((q, i) => ({
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        explanation: q.explanation,
        accepted_answers: q.accepted_answers ?? [],
        sort_order: i,
        options: q.options.map((o, j) => ({
          label: o.label,
          is_correct: o.is_correct,
          sort_order: j,
        })),
      })),
    },
    createdBy
  )
}

/**
 * Auto-grade all answers for an attempt at submit time and persist them. Objective
 * answers get awarded_points; manual ones (essay / unconfigured short answer) are
 * flagged needs_manual with null points. Then recomputes score + finalizes.
 */
export async function gradeAndFinalizeAttempt(
  companyId: string,
  attempt: QuizAttempt,
  quiz: QuizWithQuestions,
  answers: AnswerInput[]
): Promise<QuizAttempt> {
  const answerByQuestion = new Map<string, AnswerInput>()
  for (const a of answers) answerByQuestion.set(a.question_id, a)

  for (const question of quiz.questions) {
    const graded: GradedAnswer = gradeAnswer(question, answerByQuestion.get(question.id))
    const input = answerByQuestion.get(question.id)
    const { error } = await supabaseAdmin.from('ess_quiz_answers').upsert(
      {
        company_id: companyId,
        attempt_id: attempt.id,
        question_id: question.id,
        selected_option_ids: input?.selected_option_ids ?? null,
        text_answer: input?.text_answer ?? null,
        awarded_points: graded.awarded_points,
        needs_manual: graded.needs_manual,
      },
      { onConflict: 'attempt_id,question_id' }
    )
    if (error) throw new Error(`answer upsert failed: ${error.message}`)
  }

  await supabaseAdmin
    .from('ess_quiz_attempts')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', attempt.id)
    .eq('company_id', companyId)

  return recomputeAttemptResult(companyId, attempt.id)
}

/**
 * Recompute an attempt's score + pass/fail from its persisted answers. If every
 * answer is graded (no needs_manual / null points) the attempt is finalized:
 * status='graded', passed set, and the Phase 5 training hook fired once. Returns
 * the refreshed attempt.
 */
export async function recomputeAttemptResult(
  companyId: string,
  attemptId: string
): Promise<QuizAttempt> {
  const { data: attemptRow } = await supabaseAdmin
    .from('ess_quiz_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('company_id', companyId)
    .single()
  const attempt = attemptRow as QuizAttempt

  const quiz = await loadQuizWithQuestions(companyId, attempt.quiz_id)
  if (!quiz) return attempt

  const { data: answerRows } = await supabaseAdmin
    .from('ess_quiz_answers')
    .select('*')
    .eq('attempt_id', attemptId)
    .eq('company_id', companyId)
  const answers = (answerRows ?? []) as QuizAnswer[]

  const awardedByQuestion = new Map<string, number | null>()
  for (const a of answers) awardedByQuestion.set(a.question_id, a.awarded_points)
  for (const q of quiz.questions) {
    if (!awardedByQuestion.has(q.id)) awardedByQuestion.set(q.id, 0)
  }

  const score = computeScore(quiz.questions, awardedByQuestion)
  const wasGraded = attempt.status === 'graded'

  if (!score.fullyGraded) {
    const { data: updated } = await supabaseAdmin
      .from('ess_quiz_attempts')
      .update({ score: round2(score.scorePercent), status: 'submitted' })
      .eq('id', attemptId)
      .eq('company_id', companyId)
      .select('*')
      .single()
    return (updated as QuizAttempt) ?? attempt
  }

  const passed = isPass(score.scorePercent, quiz.passing_score)
  const { data: updated } = await supabaseAdmin
    .from('ess_quiz_attempts')
    .update({
      score: round2(score.scorePercent),
      passed,
      status: 'graded',
      graded_at: new Date().toISOString(),
    })
    .eq('id', attemptId)
    .eq('company_id', companyId)
    .select('*')
    .single()
  const finalAttempt = (updated as QuizAttempt) ?? attempt

  // Fire the Phase 5 contract once, on the first transition into 'graded', for
  // attempts tied to a training item.
  if (!wasGraded && finalAttempt.training_item_id) {
    await recordQuizResult(
      finalAttempt.employee_id,
      finalAttempt.training_item_id,
      passed,
      round2(score.scorePercent)
    )
  }

  return finalAttempt
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
