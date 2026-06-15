// /api/compliance/requirements — the admin-defined compliance requirement list
// (which certificates + trainings are required, for which tier/group).
//   GET  -> list with resolved names (hr+ can read the register definition).
//   POST -> add a requirement (admin only). Validates the referenced cert type
//           or training module belongs to this company.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { requirementCreateSchema, type ComplianceRequirementView } from '@/types/compliance-register'

async function ensureModule(companyId: string): Promise<NextResponse | null> {
  try {
    await assertModuleEnabled(companyId, 'compliance')
    return null
  } catch (err) {
    if (err instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    throw err
  }
}

export const GET = withAuth(
  async (_request: NextRequest, ctx: AuthContext) => {
    const moduleErr = await ensureModule(ctx.companyId)
    if (moduleErr) return moduleErr

    const { data: reqs } = await supabaseAdmin
      .from('ess_compliance_requirements')
      .select('*')
      .eq('company_id', ctx.companyId)
      .order('created_at', { ascending: true })

    const rows = reqs ?? []
    // Resolve display names for cert types + modules in two batched queries.
    const certTypeIds = rows.filter((r) => r.kind === 'certification').map((r) => r.ref_id as string)
    const moduleIds = rows.filter((r) => r.kind === 'training').map((r) => r.ref_id as string)
    const names = new Map<string, string>()
    if (certTypeIds.length) {
      const { data } = await supabaseAdmin.from('ess_cert_types').select('id, name').in('id', certTypeIds)
      for (const t of data ?? []) names.set(t.id as string, (t as { name?: string }).name ?? '')
    }
    if (moduleIds.length) {
      const { data } = await supabaseAdmin.from('ess_training_modules').select('id, title').in('id', moduleIds)
      for (const m of data ?? []) names.set(m.id as string, (m as { title?: string }).title ?? '')
    }

    const requirements: ComplianceRequirementView[] = rows.map((r) => ({
      ...(r as ComplianceRequirementView),
      ref_name: names.get(r.ref_id as string) ?? null,
    }))
    return NextResponse.json({ requirements })
  },
  { minRole: 'hr' },
)

export const POST = withAuth(
  async (request: NextRequest, ctx: AuthContext) => {
    const moduleErr = await ensureModule(ctx.companyId)
    if (moduleErr) return moduleErr

    const body = await request.json().catch(() => null)
    const parsed = requirementCreateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    const { kind, ref_id, target_type, target_value } = parsed.data

    // The referenced item must belong to this company.
    const table = kind === 'certification' ? 'ess_cert_types' : 'ess_training_modules'
    const { data: ref } = await supabaseAdmin.from(table).select('id').eq('id', ref_id).eq('company_id', ctx.companyId).single()
    if (!ref) return NextResponse.json({ error: kind === 'certification' ? 'Unknown certificate type' : 'Unknown training module' }, { status: 400 })

    // A group target must reference a real group in this company.
    if (target_type === 'group') {
      const { data: grp } = await supabaseAdmin.from('ess_training_groups').select('id').eq('id', target_value).eq('company_id', ctx.companyId).single()
      if (!grp) return NextResponse.json({ error: 'Unknown group' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('ess_compliance_requirements')
      .upsert(
        { company_id: ctx.companyId, kind, ref_id, target_type, target_value, created_by: ctx.appUser.id },
        { onConflict: 'company_id,kind,ref_id,target_type,target_value', ignoreDuplicates: false },
      )
      .select()
      .single()
    if (error || !data) {
      console.error('Requirement create error:', error)
      return NextResponse.json({ error: 'Failed to add requirement' }, { status: 500 })
    }

    await recordAudit({
      companyId: ctx.companyId,
      actorId: ctx.appUser.id,
      action: 'compliance.requirement_added',
      target: { type: 'compliance_requirement', id: data.id },
      meta: { kind, ref_id, target_type, target_value },
    })

    return NextResponse.json({ requirement: data }, { status: 201 })
  },
  { minRole: 'admin' },
)
