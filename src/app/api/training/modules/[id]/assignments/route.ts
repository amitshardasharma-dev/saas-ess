// src/app/api/training/modules/[id]/assignments/route.ts
//
// Assignments for a module. GET lists assignment rows + resolved assignees;
// POST adds an assignment (Staff/Admin). Ownership of the module is re-checked.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { createAssignmentSchema } from '@/types/training'
import { resolveAssignees } from '@/lib/training'

async function ownedModule(id: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('ess_training_modules')
    .select('id, company_id')
    .eq('id', id)
    .single()
  if (!data || data.company_id !== companyId) return null
  return data
}

export const GET = withAuth(
  async (_request: NextRequest, { companyId }, params) => {
    const moduleId = params!.id
    const mod = await ownedModule(moduleId, companyId)
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: assignments } = await supabaseAdmin
      .from('ess_training_assignments')
      .select('*')
      .eq('module_id', moduleId)
      .eq('company_id', companyId)
      .order('assigned_at', { ascending: false })

    const assignees = await resolveAssignees(moduleId)
    return NextResponse.json({ assignments: assignments ?? [], assignees })
  },
  { minRole: 'hr' }
)

export const POST = withAuth(
  async (request: NextRequest, { companyId, employee }, params) => {
    const moduleId = params!.id
    const mod = await ownedModule(moduleId, companyId)
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = createAssignmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('ess_training_assignments')
      .upsert(
        {
          company_id: companyId,
          module_id: moduleId,
          target_type: parsed.data.target_type,
          target_value: parsed.data.target_value,
          due_at: parsed.data.due_at ?? null,
        },
        { onConflict: 'module_id,target_type,target_value' }
      )
      .select()
      .single()

    if (error) {
      console.error('[training] assignment create error:', error.message)
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
    }

    await recordAudit({
      companyId,
      actorId: employee?.id ?? null,
      action: 'training.assignment.created',
      target: { type: 'training_module', id: moduleId },
      meta: { target_type: parsed.data.target_type, target_value: parsed.data.target_value },
    })

    return NextResponse.json({ assignment: data }, { status: 201 })
  },
  { minRole: 'hr' }
)

export const DELETE = withAuth(
  async (request: NextRequest, { companyId }, params) => {
    const moduleId = params!.id
    const mod = await ownedModule(moduleId, companyId)
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get('assignment_id')
    if (!assignmentId) {
      return NextResponse.json({ error: 'assignment_id required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('ess_training_assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('module_id', moduleId)
      .eq('company_id', companyId)

    if (error) {
      return NextResponse.json({ error: 'Failed to remove assignment' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  },
  { minRole: 'hr' }
)
