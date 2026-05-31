// src/app/api/quizzes/[id]/duplicate/route.ts
//
// Phase 6 — deep-copy a quiz (quiz + questions + options) into a new draft.
// Staff/Admin only. Cross-tenant id -> 404.

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { duplicateQuiz } from '@/lib/quiz/server'

export const POST = withAuth(
  async (_request: NextRequest, { companyId, employee, appUser }, params) => {
    try {
      await assertModuleEnabled(companyId, 'quizzes')
    } catch (e) {
      if (e instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
      }
      throw e
    }

    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const newId = await duplicateQuiz(companyId, id, employee?.id ?? null)
    if (!newId) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'quiz.duplicated',
      target: { type: 'quiz', id: newId },
      meta: { source_quiz_id: id },
    })
    return NextResponse.json({ id: newId }, { status: 201 })
  },
  { minRole: 'hr' }
)
