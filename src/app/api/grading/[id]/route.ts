// src/app/api/grading/[id]/route.ts
//
// Phase 6 — manual grading of one attempt. Staff (hr+) only.
//   GET  : load the attempt with its quiz, questions, and submitted answers so a
//          grader can review essays / short answers.
//   POST : apply manual grades (points + comment) to specified answers; clears
//          needs_manual and recomputes the attempt's pass/fail. When the last
//          pending answer is graded the Phase 5 training hook fires (via
//          recomputeAttemptResult).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { gradeAttemptSchema } from '@/lib/quiz/schemas'
import { loadQuizWithQuestions, recomputeAttemptResult } from '@/lib/quiz/server'
import type { QuizAnswer, QuizAttempt } from '@/types/quiz'

async function ensureModule(companyId: string): Promise<NextResponse | null> {
  try {
    await assertModuleEnabled(companyId, 'quizzes')
    return null
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw e
  }
}

export const GET = withAuth(
  async (_request: NextRequest, { companyId }, params) => {
    const gate = await ensureModule(companyId)
    if (gate) return gate

    const attemptId = params?.id
    if (!attemptId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data: attemptRow } = await supabaseAdmin
      .from('ess_quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('company_id', companyId)
      .maybeSingle()
    const attempt = attemptRow as QuizAttempt | null
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

    const quiz = await loadQuizWithQuestions(companyId, attempt.quiz_id)
    const { data: answers } = await supabaseAdmin
      .from('ess_quiz_answers')
      .select('*')
      .eq('attempt_id', attemptId)
      .eq('company_id', companyId)

    return NextResponse.json({
      attempt,
      quiz,
      answers: (answers ?? []) as QuizAnswer[],
    })
  },
  { minRole: 'hr' }
)

export const POST = withAuth(
  async (request: NextRequest, { companyId, employee, appUser }, params) => {
    const gate = await ensureModule(companyId)
    if (gate) return gate

    const attemptId = params?.id
    if (!attemptId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data: attemptRow } = await supabaseAdmin
      .from('ess_quiz_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('company_id', companyId)
      .maybeSingle()
    const attempt = attemptRow as QuizAttempt | null
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

    const body = await request.json().catch(() => null)
    const parsed = gradeAttemptSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid grades' }, { status: 400 })
    }

    // Cap awarded points at the question's max to keep scores sane.
    const quiz = await loadQuizWithQuestions(companyId, attempt.quiz_id)
    const maxByQuestion = new Map<string, number>()
    for (const q of quiz?.questions ?? []) maxByQuestion.set(q.id, q.points)

    for (const grade of parsed.data.grades) {
      // Resolve the answer's question to clamp the awarded points.
      const { data: ans } = await supabaseAdmin
        .from('ess_quiz_answers')
        .select('id, question_id')
        .eq('id', grade.answer_id)
        .eq('attempt_id', attemptId)
        .eq('company_id', companyId)
        .maybeSingle()
      if (!ans) continue
      const max = maxByQuestion.get(ans.question_id as string) ?? grade.awarded_points
      const awarded = Math.max(0, Math.min(grade.awarded_points, max))

      const { error } = await supabaseAdmin
        .from('ess_quiz_answers')
        .update({
          awarded_points: awarded,
          grader_comment: grade.grader_comment ?? null,
          needs_manual: false,
          graded_by: employee?.id ?? null,
        })
        .eq('id', grade.answer_id)
        .eq('attempt_id', attemptId)
        .eq('company_id', companyId)
      if (error) {
        console.error('[grading] grade update failed:', error.message)
        return NextResponse.json({ error: 'Failed to apply grades' }, { status: 500 })
      }
    }

    const finalAttempt = await recomputeAttemptResult(companyId, attemptId)

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'quiz.attempt.graded',
      target: { type: 'quiz_attempt', id: attemptId },
      meta: {
        graded: parsed.data.grades.length,
        score: finalAttempt.score,
        passed: finalAttempt.passed,
        status: finalAttempt.status,
      },
    })

    return NextResponse.json({ attempt: finalAttempt })
  },
  { minRole: 'hr' }
)
