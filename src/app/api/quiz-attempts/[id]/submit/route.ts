// src/app/api/quiz-attempts/[id]/submit/route.ts
//
// Phase 6 — submit an attempt. Auto-grades objective answers, routes essays /
// unconfigured short answers to the manual queue, computes the score, and (when
// fully graded) finalizes pass/fail + fires the Phase 5 training hook.
//
// Server-authoritative time limit: a submission past started_at + time_limit is
// still ACCEPTED but auto-submitted (answers captured up to the deadline). We do
// not silently drop the work; we record the overrun in the audit meta.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { submitAttemptSchema } from '@/lib/quiz/schemas'
import { elapsedSeconds, isExpired } from '@/lib/quiz/timing'
import { gradeAndFinalizeAttempt, loadQuizWithQuestions } from '@/lib/quiz/server'
import type { QuizAttempt } from '@/types/quiz'

export const POST = withAuth(async (request: NextRequest, { companyId, employee, appUser }, params) => {
  try {
    await assertModuleEnabled(companyId, 'quizzes')
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw e
  }

  if (!employee) {
    return NextResponse.json({ error: 'Employee record required' }, { status: 403 })
  }

  const attemptId = params?.id
  if (!attemptId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Load attempt tenant-scoped + ownership-checked (cross-tenant / other-user -> 404).
  const { data: attemptRow } = await supabaseAdmin
    .from('ess_quiz_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('company_id', companyId)
    .eq('employee_id', employee.id)
    .maybeSingle()
  const attempt = attemptRow as QuizAttempt | null
  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 })
  }

  const quiz = await loadQuizWithQuestions(companyId, attempt.quiz_id)
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = submitAttemptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid submission' }, { status: 400 })
  }

  const nowMs = Date.now()
  const expired = isExpired(attempt.started_at, quiz.time_limit_seconds, nowMs)
  const serverElapsed = elapsedSeconds(attempt.started_at, nowMs)
  // Trust the smaller of client-reported time and server elapsed (bounded).
  const timeSpent = Math.min(
    serverElapsed,
    parsed.data.time_spent_seconds ?? serverElapsed
  )

  await supabaseAdmin
    .from('ess_quiz_attempts')
    .update({ time_spent_seconds: timeSpent })
    .eq('id', attempt.id)
    .eq('company_id', companyId)

  const finalAttempt = await gradeAndFinalizeAttempt(companyId, attempt, quiz, parsed.data.answers)

  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'quiz.attempt.submitted',
    target: { type: 'quiz_attempt', id: attempt.id },
    meta: {
      quiz_id: attempt.quiz_id,
      score: finalAttempt.score,
      passed: finalAttempt.passed,
      status: finalAttempt.status,
      expired,
    },
  })

  return NextResponse.json({ attempt: finalAttempt })
})
