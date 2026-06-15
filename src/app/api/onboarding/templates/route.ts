// /api/onboarding/templates — manage the editable onboarding flows (admin).
//   GET -> the Volunteer + Staff templates (with steps) plus the documents,
//          certificate types and training modules a step can link to.
//   PUT -> replace one audience's steps. Edits apply to people onboarded from
//          now on; existing in-progress checklists are unchanged.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'
import { loadTemplate, saveTemplateSteps, refKindForStepType } from '@/lib/onboarding'

const STEP_TYPES = ['profile_field', 'doc_sign', 'doc_ack', 'certification', 'training', 'manual'] as const

const stepSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    step_type: z.enum(STEP_TYPES),
    ref_id: z.string().uuid().nullable().optional(),
    auto_complete: z.boolean().optional(),
  })
  .strict()

const saveSchema = z
  .object({
    audience: z.enum(['volunteer', 'staff']),
    steps: z.array(stepSchema).max(50),
  })
  .strict()

export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext) => {
    const [volunteer, staff] = await Promise.all([
      loadTemplate(ctx.companyId, 'volunteer'),
      loadTemplate(ctx.companyId, 'staff'),
    ])
    const [{ data: docs }, { data: certs }, { data: mods }] = await Promise.all([
      supabaseAdmin.from('ess_documents').select('id, title').eq('company_id', ctx.companyId).order('title'),
      supabaseAdmin.from('ess_cert_types').select('id, name').eq('company_id', ctx.companyId).order('name'),
      supabaseAdmin.from('ess_training_modules').select('id, title').eq('company_id', ctx.companyId).eq('status', 'published').order('title'),
    ])
    return NextResponse.json({
      templates: { volunteer, staff },
      options: {
        documents: (docs ?? []).map((d) => ({ id: d.id, title: (d as { title?: string }).title ?? '' })),
        certTypes: (certs ?? []).map((c) => ({ id: c.id, name: (c as { name?: string }).name ?? '' })),
        modules: (mods ?? []).map((m) => ({ id: m.id, title: (m as { title?: string }).title ?? '' })),
      },
    })
  },
  { minRole: 'admin' },
)

export const PUT = withAuth(
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null)
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    // Validate every provided ref belongs to this company + matches its kind.
    const need = { document: new Set<string>(), cert_type: new Set<string>(), training_module: new Set<string>() }
    for (const s of parsed.data.steps) {
      const kind = refKindForStepType(s.step_type)
      if (kind && s.ref_id) need[kind].add(s.ref_id)
    }
    const exists = async (table: string, ids: Set<string>, extraEq?: [string, string]) => {
      if (ids.size === 0) return true
      let q = supabaseAdmin.from(table).select('id').eq('company_id', ctx.companyId).in('id', [...ids])
      if (extraEq) q = q.eq(extraEq[0], extraEq[1])
      const { data } = await q
      return (data ?? []).length === ids.size
    }
    const [okDoc, okCert, okMod] = await Promise.all([
      exists('ess_documents', need.document),
      exists('ess_cert_types', need.cert_type),
      exists('ess_training_modules', need.training_module),
    ])
    if (!okDoc || !okCert || !okMod) return NextResponse.json({ error: 'A linked item is invalid for this company' }, { status: 400 })

    await saveTemplateSteps(
      ctx.companyId,
      parsed.data.audience,
      parsed.data.steps.map((s) => ({
        title: s.title,
        description: s.description ?? null,
        step_type: s.step_type,
        ref_id: s.ref_id ?? null,
        auto_complete: s.auto_complete ?? false,
      })),
    )

    await recordAudit({
      companyId: ctx.companyId,
      actorId: ctx.appUser.id,
      action: 'onboarding.template_updated',
      target: { type: 'onboarding_template', id: parsed.data.audience },
      meta: { audience: parsed.data.audience, steps: parsed.data.steps.length },
    })

    return NextResponse.json({ template: await loadTemplate(ctx.companyId, parsed.data.audience) })
  },
  { minRole: 'admin' },
)
