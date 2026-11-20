// POST /api/onboarding/steps — add a step for ONE person (admin).
// Body: { employee_id, title, description?, step_type, ref_id?, is_required? }
// The step is 'personal': flow syncs never remove it, also when the person's
// volunteer types change. A linked step auto-completes when the person does
// the linked item, and starts done if they already did it.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'
import { advanceOnboarding, isStepSatisfiedFor, refKindForStepType, stepKey } from '@/lib/onboarding'

const STEP_TYPES = ['profile_field', 'doc_sign', 'doc_ack', 'certification', 'training', 'manual'] as const
const REF_TABLE = { document: 'ess_documents', cert_type: 'ess_cert_types', training_module: 'ess_training_modules' } as const

const schema = z
  .object({
    employee_id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    step_type: z.enum(STEP_TYPES),
    ref_id: z.string().uuid().nullable().optional(),
    is_required: z.boolean().optional(),
  })
  .strict()

export const POST = withAuth(
  async (req: NextRequest, { companyId, appUser }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    const input = parsed.data

    const { data: emp } = await supabaseAdmin
      .from('ess_employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('id', input.employee_id)
      .maybeSingle()
    if (!emp) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

    const refKind = refKindForStepType(input.step_type)
    const refId = refKind ? input.ref_id ?? null : null
    if (refKind && !refId) return NextResponse.json({ error: 'Select the linked item for this step' }, { status: 400 })
    if (refKind && refId) {
      const { data: ref } = await supabaseAdmin.from(REF_TABLE[refKind]).select('id').eq('company_id', companyId).eq('id', refId).maybeSingle()
      if (!ref) return NextResponse.json({ error: 'The linked item is invalid for this company' }, { status: 400 })
    }

    // The person needs a checklist (state row) for the status to roll up.
    const { data: state } = await supabaseAdmin
      .from('ess_onboarding_states')
      .select('id')
      .eq('company_id', companyId)
      .eq('employee_id', emp.id)
      .maybeSingle()
    if (!state) {
      await supabaseAdmin.from('ess_onboarding_states').insert({ company_id: companyId, employee_id: emp.id, status: 'not_started' })
    }

    const { data: mine } = await supabaseAdmin
      .from('ess_onboarding_steps')
      .select('title, step_type, ref_id, sort_order')
      .eq('company_id', companyId)
      .eq('employee_id', emp.id)
    const key = stepKey({ step_type: input.step_type, ref_id: refId, title: input.title })
    if ((mine ?? []).some((s) => stepKey(s as { title: string; step_type: string; ref_id: string | null }) === key)) {
      return NextResponse.json({ error: 'This person already has this step' }, { status: 409 })
    }
    const sortOrder = Math.max(999, ...(mine ?? []).map((s) => Number(s.sort_order) || 0)) + 1

    const done = await isStepSatisfiedFor(companyId, emp.id, input.step_type, refId)
    const nowIso = new Date().toISOString()
    const { data: step, error } = await supabaseAdmin
      .from('ess_onboarding_steps')
      .insert({
        company_id: companyId,
        employee_id: emp.id,
        title: input.title,
        description: input.description ?? null,
        sort_order: sortOrder,
        status: done ? 'done' : 'pending',
        completed_at: done ? nowIso : null,
        step_type: input.step_type,
        ref_kind: refKind,
        ref_id: refId,
        auto_complete: Boolean(refId),
        is_required: input.is_required ?? true,
        origin: 'personal',
        added_by: appUser.id,
      })
      .select()
      .single()
    if (error || !step) return NextResponse.json({ error: error?.message ?? 'Could not add the step' }, { status: 500 })

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'onboarding.step.added',
      target: { type: 'employee', id: emp.id },
      meta: { stepId: step.id, title: input.title, step_type: input.step_type, ref_id: refId, is_required: input.is_required ?? true },
    })

    const status = await advanceOnboarding(emp.id)
    return NextResponse.json({ step, status }, { status: 201 })
  },
  { minRole: 'admin' },
)
