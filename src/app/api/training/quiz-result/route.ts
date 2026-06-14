// src/app/api/training/quiz-result/route.ts
//
// HTTP surface over the published recordQuizResult contract. Phase 6 normally
// calls @/lib/training.recordQuizResult directly (in-process), but this route
// lets a quiz client post a result too. The caller must be assigned the item's
// module. Module-gated on 'training_tracking'.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordQuizResult, isAssigned } from '@/lib/training'

export const POST = withAuth(async (request: NextRequest, { companyId, employee }) => {
  try {
    await assertModuleEnabled(companyId, 'training_tracking')
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw e
  }

  if (!employee) return NextResponse.json({ error: 'Employee record required' }, { status: 403 })

  let body: { item_id?: string; passed?: boolean; score?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.item_id || typeof body.passed !== 'boolean') {
    return NextResponse.json({ error: 'item_id and passed are required' }, { status: 400 })
  }

  const { data: item } = await supabaseAdmin
    .from('ess_training_items')
    .select('id, company_id, module_id, type')
    .eq('id', body.item_id)
    .single()
  if (!item || item.company_id !== companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!(await isAssigned(employee.id, item.module_id as string))) {
    return NextResponse.json({ error: 'Not assigned' }, { status: 403 })
  }

  await recordQuizResult(employee.id, body.item_id, body.passed, body.score)
  return NextResponse.json({ ok: true })
})
