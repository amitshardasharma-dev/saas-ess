// src/app/api/quizzes/[id]/route.ts
//
// Phase 6 — single quiz endpoint.
//   GET    : load a quiz with questions + options (tenant-scoped; 404 cross-tenant).
//   PUT    : replace a quiz aggregate (Staff/Admin).
//   DELETE : delete a quiz (Staff/Admin). Cascades to questions/options/attempts.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { quizUpsertSchema } from '@/lib/quiz/schemas'
import { loadQuizWithQuestions, saveQuizAggregate } from '@/lib/quiz/server'

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

export const GET = withAuth(async (_request: NextRequest, { companyId }, params) => {
  const gate = await ensureModule(companyId)
  if (gate) return gate

  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const quiz = await loadQuizWithQuestions(companyId, id)
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
  return NextResponse.json({ quiz })
})

export const PUT = withAuth(
  async (request: NextRequest, { companyId, employee, appUser }, params) => {
    const gate = await ensureModule(companyId)
    if (gate) return gate

    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Cross-tenant access -> 404.
    const existing = await loadQuizWithQuestions(companyId, id)
    if (!existing) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

    const body = await request.json().catch(() => null)
    const parsed = quizUpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid quiz', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    try {
      await saveQuizAggregate(companyId, parsed.data, employee?.id ?? null, id)
      await recordAudit({
        companyId,
        actorId: appUser.id,
        action: 'quiz.updated',
        target: { type: 'quiz', id },
        meta: { title: parsed.data.title },
      })
      return NextResponse.json({ id })
    } catch (e) {
      console.error('[quizzes] update failed:', e)
      return NextResponse.json({ error: 'Failed to update quiz' }, { status: 500 })
    }
  },
  { minRole: 'hr' }
)

export const DELETE = withAuth(
  async (_request: NextRequest, { companyId, appUser }, params) => {
    const gate = await ensureModule(companyId)
    if (gate) return gate

    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const existing = await loadQuizWithQuestions(companyId, id)
    if (!existing) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

    const { error } = await supabaseAdmin
      .from('ess_quizzes')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
    if (error) {
      console.error('[quizzes] delete failed:', error.message)
      return NextResponse.json({ error: 'Failed to delete quiz' }, { status: 500 })
    }

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'quiz.deleted',
      target: { type: 'quiz', id },
    })
    return NextResponse.json({ ok: true })
  },
  { minRole: 'hr' }
)
