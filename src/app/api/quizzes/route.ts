// src/app/api/quizzes/route.ts
//
// Phase 6 — quiz collection endpoint.
//   GET  : list quizzes for the tenant (published contract; Phase 7 reads this).
//          Any authenticated user may list (runtime needs to resolve quizzes);
//          builder mutations require Staff (hr+).
//   POST : create a quiz aggregate (Staff/Admin only).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { quizUpsertSchema } from '@/lib/quiz/schemas'
import { saveQuizAggregate } from '@/lib/quiz/server'
import type { Quiz } from '@/types/quiz'

export const GET = withAuth(async (request: NextRequest, { companyId }) => {
  try {
    await assertModuleEnabled(companyId, 'quizzes')
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw e
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabaseAdmin
    .from('ess_quizzes')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    console.error('[quizzes] list failed:', error.message)
    return NextResponse.json({ error: 'Failed to fetch quizzes' }, { status: 500 })
  }
  return NextResponse.json({ quizzes: (data ?? []) as Quiz[] })
})

export const POST = withAuth(
  async (request: NextRequest, { companyId, employee, appUser }) => {
    try {
      await assertModuleEnabled(companyId, 'quizzes')
    } catch (e) {
      if (e instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
      }
      throw e
    }

    const body = await request.json().catch(() => null)
    const parsed = quizUpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid quiz', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    try {
      const id = await saveQuizAggregate(companyId, parsed.data, employee?.id ?? null)
      await recordAudit({
        companyId,
        actorId: appUser.id,
        action: 'quiz.created',
        target: { type: 'quiz', id },
        meta: { title: parsed.data.title, questions: parsed.data.questions.length },
      })
      return NextResponse.json({ id }, { status: 201 })
    } catch (e) {
      console.error('[quizzes] create failed:', e)
      return NextResponse.json({ error: 'Failed to create quiz' }, { status: 500 })
    }
  },
  { minRole: 'hr' }
)
