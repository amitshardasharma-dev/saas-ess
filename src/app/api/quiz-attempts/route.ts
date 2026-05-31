// src/app/api/quiz-attempts/route.ts
//
// Phase 6 — attempt collection endpoint.
//   GET  : list attempts scoped by ?employee_id=&quiz_id= (published contract;
//          Phase 7 reporting reads scores). Volunteers see only their own; Staff
//          (hr+) may query any employee in the tenant.
//   POST : start a new attempt for the current volunteer. Server-authoritative
//          attempt-limit enforcement; sets started_at for the time limit.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { startAttemptSchema } from '@/lib/quiz/schemas'
import { canStartAttempt, nextAttemptNo } from '@/lib/quiz/timing'
import { loadQuizWithQuestions } from '@/lib/quiz/server'
import { hasMinRole } from '@/types/roles'
import type { QuizAttempt } from '@/types/quiz'

export const GET = withAuth(async (request: NextRequest, { companyId, employee, role }) => {
  try {
    await assertModuleEnabled(companyId, 'quizzes')
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw e
  }

  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employee_id')
  const quizId = searchParams.get('quiz_id')

  let query = supabaseAdmin
    .from('ess_quiz_attempts')
    .select('*')
    .eq('company_id', companyId)
    .order('started_at', { ascending: false })

  const isStaff = hasMinRole(role, 'hr')
  if (isStaff) {
    if (employeeId) query = query.eq('employee_id', employeeId)
  } else {
    // Volunteers can only read their own attempts.
    if (!employee) return NextResponse.json({ attempts: [] })
    query = query.eq('employee_id', employee.id)
  }
  if (quizId) query = query.eq('quiz_id', quizId)

  const { data, error } = await query
  if (error) {
    console.error('[quiz-attempts] list failed:', error.message)
    return NextResponse.json({ error: 'Failed to fetch attempts' }, { status: 500 })
  }
  return NextResponse.json({ attempts: (data ?? []) as QuizAttempt[] })
})

export const POST = withAuth(async (request: NextRequest, { companyId, employee, appUser }) => {
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

  const body = await request.json().catch(() => null)
  const parsed = startAttemptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { quiz_id, training_item_id } = parsed.data

  const quiz = await loadQuizWithQuestions(companyId, quiz_id)
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
  if (quiz.status !== 'published') {
    return NextResponse.json({ error: 'Quiz is not available' }, { status: 409 })
  }

  // Server-authoritative attempt-limit enforcement.
  const { count, error: countErr } = await supabaseAdmin
    .from('ess_quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('employee_id', employee.id)
    .eq('quiz_id', quiz_id)
  if (countErr) {
    console.error('[quiz-attempts] count failed:', countErr.message)
    return NextResponse.json({ error: 'Failed to start attempt' }, { status: 500 })
  }
  const prior = count ?? 0
  if (!canStartAttempt(quiz.attempt_limit, prior)) {
    return NextResponse.json({ error: 'Attempt limit reached' }, { status: 409 })
  }

  const { data: attempt, error } = await supabaseAdmin
    .from('ess_quiz_attempts')
    .insert({
      company_id: companyId,
      quiz_id,
      employee_id: employee.id,
      training_item_id: training_item_id ?? null,
      attempt_no: nextAttemptNo(prior),
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single()
  if (error || !attempt) {
    console.error('[quiz-attempts] start failed:', error?.message)
    return NextResponse.json({ error: 'Failed to start attempt' }, { status: 500 })
  }

  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'quiz.attempt.started',
    target: { type: 'quiz_attempt', id: attempt.id as string },
    meta: { quiz_id, attempt_no: attempt.attempt_no },
  })

  return NextResponse.json({ attempt: attempt as QuizAttempt, quiz }, { status: 201 })
})
