// src/app/api/grading/route.ts
//
// Phase 6 — manual-grade queue listing. Staff (hr+) only. Returns submitted
// attempts that still have answers flagged needs_manual, with the quiz title and
// the count of pending answers.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import type { QuizAttempt } from '@/types/quiz'

export const GET = withAuth(
  async (_request: NextRequest, { companyId }) => {
    try {
      await assertModuleEnabled(companyId, 'quizzes')
    } catch (e) {
      if (e instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
      }
      throw e
    }

    // Answers awaiting manual grading.
    const { data: pendingAnswers, error: aErr } = await supabaseAdmin
      .from('ess_quiz_answers')
      .select('attempt_id')
      .eq('company_id', companyId)
      .eq('needs_manual', true)
      .is('awarded_points', null)
    if (aErr) {
      console.error('[grading] pending answers failed:', aErr.message)
      return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 })
    }

    const pendingByAttempt = new Map<string, number>()
    for (const row of pendingAnswers ?? []) {
      const k = row.attempt_id as string
      pendingByAttempt.set(k, (pendingByAttempt.get(k) ?? 0) + 1)
    }
    const attemptIds = [...pendingByAttempt.keys()]
    if (attemptIds.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const { data: attempts, error: tErr } = await supabaseAdmin
      .from('ess_quiz_attempts')
      .select('*')
      .eq('company_id', companyId)
      .in('id', attemptIds)
      .order('submitted_at', { ascending: true })
    if (tErr) {
      console.error('[grading] attempts failed:', tErr.message)
      return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 })
    }

    const attemptList = (attempts ?? []) as QuizAttempt[]
    const quizIds = [...new Set(attemptList.map((a) => a.quiz_id))]
    const titleById = new Map<string, string>()
    if (quizIds.length > 0) {
      const { data: quizzes } = await supabaseAdmin
        .from('ess_quizzes')
        .select('id, title')
        .eq('company_id', companyId)
        .in('id', quizIds)
      for (const q of quizzes ?? []) titleById.set(q.id as string, q.title as string)
    }

    const items = attemptList.map((attempt) => ({
      attempt,
      quiz_title: titleById.get(attempt.quiz_id) ?? 'Quiz',
      pending: pendingByAttempt.get(attempt.id) ?? 0,
    }))

    return NextResponse.json({ items })
  },
  { minRole: 'hr' }
)
