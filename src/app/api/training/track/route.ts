// src/app/api/training/track/route.ts
//
// Volunteer tracking endpoint: video watch ack, document download/ack, and
// throttled+capped time ticks. The caller must be able to take the item's module
// (canTakeModule: assignment rule, onboarding step or compliance requirement).
// Module-gated on 'training_tracking'.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { trackEventSchema } from '@/types/training'
import { recordItemEvent, canTakeModule } from '@/lib/training'

export const POST = withAuth(async (request: NextRequest, { companyId, employee, role }) => {
  try {
    await assertModuleEnabled(companyId, 'training_tracking')
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw e
  }

  if (!employee) return NextResponse.json({ error: 'Employee record required' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = trackEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // Verify the item belongs to this tenant and the caller can take its module.
  const { data: item } = await supabaseAdmin
    .from('ess_training_items')
    .select('id, company_id, module_id')
    .eq('id', parsed.data.item_id)
    .single()
  if (!item || item.company_id !== companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!(await canTakeModule(companyId, employee.id, role, item.module_id as string))) {
    return NextResponse.json({ error: 'Not assigned' }, { status: 403 })
  }

  const progress = await recordItemEvent(
    employee.id,
    parsed.data.item_id,
    parsed.data.event,
    parsed.data.seconds
  )

  return NextResponse.json({ progress })
})
