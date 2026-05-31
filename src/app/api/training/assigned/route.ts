// src/app/api/training/assigned/route.ts
//
// Volunteer learning view: the published modules assigned to the current
// employee, each with items + per-item progress + percent_complete + status.
// Module-gated on 'training'.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { assignedModuleIdsForEmployee } from '@/lib/training'
import type {
  AssignedModule,
  TrainingItem,
  TrainingItemProgress,
  TrainingModule,
  TrainingProgress,
} from '@/types/training'

export const GET = withAuth(async (_request: NextRequest, { companyId, employee }) => {
  try {
    await assertModuleEnabled(companyId, 'training')
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw e
  }

  if (!employee) return NextResponse.json({ modules: [] })

  const moduleIds = await assignedModuleIdsForEmployee(companyId, employee.id)
  if (moduleIds.length === 0) return NextResponse.json({ modules: [] })

  const [{ data: modules }, { data: items }, { data: itemProgress }, { data: moduleProgress }] =
    await Promise.all([
      supabaseAdmin
        .from('ess_training_modules')
        .select('*')
        .eq('company_id', companyId)
        .in('id', moduleIds),
      supabaseAdmin
        .from('ess_training_items')
        .select('*')
        .eq('company_id', companyId)
        .in('module_id', moduleIds)
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('ess_training_item_progress')
        .select('*')
        .eq('company_id', companyId)
        .eq('employee_id', employee.id),
      supabaseAdmin
        .from('ess_training_progress')
        .select('*')
        .eq('company_id', companyId)
        .eq('employee_id', employee.id)
        .in('module_id', moduleIds),
    ])

  const itemProgressById = new Map<string, TrainingItemProgress>(
    (itemProgress ?? []).map((p) => [p.item_id as string, p as TrainingItemProgress])
  )
  const moduleProgressById = new Map<string, TrainingProgress>(
    (moduleProgress ?? []).map((p) => [p.module_id as string, p as TrainingProgress])
  )
  const itemsByModule = new Map<string, TrainingItem[]>()
  for (const it of (items ?? []) as TrainingItem[]) {
    const list = itemsByModule.get(it.module_id) ?? []
    list.push(it)
    itemsByModule.set(it.module_id, list)
  }

  const result: AssignedModule[] = (modules ?? []).map((m) => {
    const mod = m as TrainingModule
    const modItems = (itemsByModule.get(mod.id) ?? []).map((it) => ({
      ...it,
      progress: itemProgressById.get(it.id) ?? null,
    }))
    const mp = moduleProgressById.get(mod.id)
    return {
      ...mod,
      items: modItems,
      percent_complete: mp?.percent_complete ?? 0,
      module_status: mp?.status ?? 'not_started',
      due_at: null,
    }
  })

  return NextResponse.json({ modules: result })
})
