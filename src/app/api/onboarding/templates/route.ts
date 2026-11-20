// /api/onboarding/templates — manage the editable onboarding flows (admin).
//   GET -> the Volunteer ("all volunteers") + Staff base templates, every
//          volunteer type with its flow, plus the documents, certificate types
//          and training modules a step can link to.
//   PUT -> replace one flow's steps. Body: { audience: 'volunteer'|'staff', steps }
//          or { type_id, steps }. The saved flow is then applied to the people
//          who ALREADY exist, not just future joiners: missing steps are added
//          (already-satisfied ones land done), wording is refreshed, and steps
//          that left the flow are dropped unless they were completed.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'
import {
  loadTemplate,
  loadTemplateSteps,
  saveTemplateSteps,
  saveStepsForTemplate,
  refKindForStepType,
  syncOnboardingForPeople,
  loadStepOptions,
  starterFlowSteps,
  type SyncStats,
} from '@/lib/onboarding'
import { listVolunteerTypes } from '@/lib/volunteer-types'

const STEP_TYPES = ['profile_field', 'doc_sign', 'doc_ack', 'certification', 'training', 'manual'] as const

const stepSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    step_type: z.enum(STEP_TYPES),
    ref_id: z.string().uuid().nullable().optional(),
    auto_complete: z.boolean().optional(),
    is_required: z.boolean().optional(),
  })
  .strict()

const saveSchema = z
  .object({
    audience: z.enum(['volunteer', 'staff']).optional(),
    type_id: z.string().uuid().optional(),
    steps: z.array(stepSchema).max(50),
  })
  .strict()
  .refine((d) => Boolean(d.audience) !== Boolean(d.type_id), { message: 'Give audience or type_id' })

export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext) => {
    const [volunteer, staff, types, options] = await Promise.all([
      loadTemplate(ctx.companyId, 'volunteer'),
      loadTemplate(ctx.companyId, 'staff'),
      listVolunteerTypes(ctx.companyId),
      loadStepOptions(ctx.companyId),
    ])
    const typeFlows = await Promise.all(
      types.map(async (t) => ({ ...t, steps: await loadTemplateSteps(ctx.companyId, t.templateId) })),
    )
    // An empty base flow gives new people the starter steps. Show them, so the
    // admin sees what people get (starter: true = nothing saved yet).
    const effective = <T extends { steps: unknown[] }>(t: T) =>
      t.steps.length > 0
        ? { ...t, starter: false }
        : { ...t, steps: starterFlowSteps().map((st, i) => ({ ...st, sort_order: i })), starter: true }
    return NextResponse.json({ templates: { volunteer: effective(volunteer), staff: effective(staff) }, types: typeFlows, options })
  },
  { minRole: 'admin' },
)

export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null)
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    const { audience, type_id: typeId } = parsed.data

    // A type flow: the type must belong to this company.
    let typeTemplateId: string | null = null
    let typeName = ''
    if (typeId) {
      const type = (await listVolunteerTypes(ctx.companyId)).find((t) => t.id === typeId)
      if (!type) return NextResponse.json({ error: 'Volunteer type not found' }, { status: 404 })
      typeTemplateId = type.templateId
      typeName = type.name
    }

    // Validate every provided ref belongs to this company + matches its kind.
    const need = { document: new Set<string>(), cert_type: new Set<string>(), training_module: new Set<string>() }
    for (const s of parsed.data.steps) {
      const kind = refKindForStepType(s.step_type)
      if (kind && s.ref_id) need[kind].add(s.ref_id)
    }
    const exists = async (table: string, ids: Set<string>) => {
      if (ids.size === 0) return true
      const { data } = await supabaseAdmin.from(table).select('id').eq('company_id', ctx.companyId).in('id', [...ids])
      return (data ?? []).length === ids.size
    }
    const [okDoc, okCert, okMod] = await Promise.all([
      exists('ess_documents', need.document),
      exists('ess_cert_types', need.cert_type),
      exists('ess_training_modules', need.training_module),
    ])
    if (!okDoc || !okCert || !okMod) return NextResponse.json({ error: 'A linked item is invalid for this company' }, { status: 400 })

    const steps = parsed.data.steps.map((s) => ({
      title: s.title,
      description: s.description ?? null,
      step_type: s.step_type,
      ref_id: s.ref_id ?? null,
      auto_complete: s.auto_complete ?? false,
      is_required: s.is_required ?? true,
    }))
    if (typeTemplateId) await saveStepsForTemplate(ctx.companyId, typeTemplateId, steps)
    else await saveTemplateSteps(ctx.companyId, audience!, steps)

    // Apply the change to people who already exist. Best-effort: a sync failure
    // must not lose the admin's edit, which is already saved above.
    let sync: SyncStats = { people: 0, added: 0, removed: 0, autoCompleted: 0 }
    try {
      sync = await syncOnboardingForPeople(ctx.companyId, typeId ? { volunteerTypeId: typeId } : { audience })
    } catch (err) {
      console.error('[onboarding] template sync failed (non-fatal):', (err as Error)?.message)
    }

    await recordAudit({
      companyId: ctx.companyId,
      actorId: ctx.appUser.id,
      action: 'onboarding.template_updated',
      target: { type: 'onboarding_template', id: typeId ?? audience ?? null },
      meta: { audience: audience ?? 'type', typeId: typeId ?? null, typeName: typeName || null, steps: steps.length, sync },
    })

    const template = typeTemplateId
      ? { id: typeTemplateId, name: typeName, audience: 'type', typeId, steps: await loadTemplateSteps(ctx.companyId, typeTemplateId) }
      : await loadTemplate(ctx.companyId, audience!)
    return NextResponse.json({ template, sync })
  },
  { minRole: 'admin' },
)
