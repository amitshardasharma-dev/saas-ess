// /api/profile/certifications — SELF-SCOPED certifications for the signed-in
// volunteer. This is the volunteer-facing counterpart to the hr-gated
// /api/certifications route: it lets any authenticated employee list and add
// THEIR OWN certifications (e.g. the onboarding "Add certificate" CTA), without
// the hr role the staff register requires.
//
// SECURITY: employee_id is ALWAYS forced to ctx.employee.id. The request body is
// never trusted for identity — a body employee_id is ignored entirely, so a
// volunteer can only ever create a cert against their own record (no IDOR / no
// cross-tenant write). Module-gated on 'compliance' exactly like the hr route.
//
// Mirrors the hr route's expiry derivation (calcExpiry from the cert type's
// validity_months), history write, audit, and onboarding auto-complete — all
// self-scoped.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { calcExpiry, calcStatus, daysUntil, indicatorForStatus } from '@/lib/compliance/expiry'
import { writeCertHistory } from '@/services/compliance'
import { completeLinkedOnboardingStep } from '@/lib/onboarding'
import { selfCertificationCreateSchema } from '@/types/compliance'

async function ensureModule(companyId: string): Promise<NextResponse | null> {
  try {
    await assertModuleEnabled(companyId, 'compliance')
    return null
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw err
  }
}

// GET — the caller's OWN certifications (with computed status/indicator/days),
// plus the company's cert types so the add-certificate form has options. Default
// minRole is 'employee' (any authenticated user).
export const GET = withAuth(async (_request: NextRequest, ctx: AuthContext) => {
  const { companyId, employee } = ctx
  const moduleErr = await ensureModule(companyId)
  if (moduleErr) return moduleErr

  // No linked employee record -> nothing to show, but still surface cert types so
  // the form can render (the POST will reject without an employee anyway).
  const { data: types } = await supabaseAdmin
    .from('ess_cert_types')
    .select('id, name, validity_months, requires_file, required')
    .eq('company_id', companyId)
    .order('name')
  const certTypes = types || []

  if (!employee) {
    return NextResponse.json({ certifications: [], cert_types: certTypes })
  }

  const { data, error } = await supabaseAdmin
    .from('ess_certifications')
    .select(`
      *,
      ess_cert_types ( name )
    `)
    .eq('company_id', companyId)
    .eq('employee_id', employee.id)
    .order('expiry_date', { ascending: true })

  if (error) {
    console.error('Self certifications fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch certifications' }, { status: 500 })
  }

  const processed = (data || []).map((c: Record<string, unknown>) => {
    const ctype = c.ess_cert_types as { name?: string } | null
    const expiry = (c.expiry_date as string | null) ?? null
    const status = calcStatus(expiry)
    return {
      ...c,
      cert_type_name: ctype?.name ?? null,
      status,
      days_until_expiry: daysUntil(expiry),
      indicator: indicatorForStatus(status),
      ess_cert_types: undefined,
    }
  })

  return NextResponse.json({ certifications: processed, cert_types: certTypes })
})

// POST — create a certification for the CALLER ONLY. employee_id is forced to
// ctx.employee.id; the body is never read for identity. Accepts
// { cert_type_id, title, completion_date }. Expiry is derived from the cert
// type's validity_months (company-scoped), mirroring the hr route. After insert,
// the linked onboarding 'certification' step (ref_id == cert_type_id) is
// auto-completed for THIS employee.
export const POST = withAuth(async (request: NextRequest, ctx: AuthContext) => {
  const { companyId, employee, appUser } = ctx
  const moduleErr = await ensureModule(companyId)
  if (moduleErr) return moduleErr

  // Identity is required to create a self-scoped cert. Without a linked employee
  // record there is no "self" to attach the cert to.
  if (!employee) {
    return NextResponse.json({ error: 'No employee record for this account' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = selfCertificationCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  // Resolve the cert type (must belong to this company) for validity. Required:
  // self-service certs are always tied to a company-defined type.
  const { data: certType, error: typeErr } = await supabaseAdmin
    .from('ess_cert_types')
    .select('id, validity_months')
    .eq('id', parsed.data.cert_type_id)
    .eq('company_id', companyId)
    .single()
  if (typeErr || !certType) {
    return NextResponse.json({ error: 'Unknown cert type' }, { status: 400 })
  }
  const validityMonths = (certType.validity_months as number | null) ?? null

  // Auto-derive expiry from completion + validity (mirrors the hr create path).
  const completion = parsed.data.completion_date ?? null
  const expiry = calcExpiry(completion, validityMonths)
  const status = calcStatus(expiry)

  const { data, error } = await supabaseAdmin
    .from('ess_certifications')
    .insert({
      company_id: companyId,
      // CRITICAL: forced to the caller's own employee id — NEVER from the body.
      employee_id: employee.id,
      cert_type_id: parsed.data.cert_type_id,
      title: parsed.data.title,
      completion_date: completion,
      expiry_date: expiry,
      status,
      // Volunteer/staff self-submissions enter the review queue (hr+ validates).
      verification_status: 'submitted',
      created_by: employee.id,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('Self certification create error:', error)
    return NextResponse.json({ error: 'Failed to create certification' }, { status: 500 })
  }

  await writeCertHistory({
    certificationId: data.id,
    action: 'created',
    performedBy: employee.id,
  })

  await recordAudit({
    companyId,
    actorId: appUser.id,
    action: 'certification.created',
    target: { type: 'certification', id: data.id },
    meta: { status, self: true },
  })

  // Auto-complete the linked onboarding step (certification -> this cert type)
  // for the CALLER. Tenant-safe by construction (keyed on the caller's own
  // employee id). No-op if the volunteer has no matching auto_complete step.
  try {
    await completeLinkedOnboardingStep(employee.id, {
      stepType: 'certification',
      refId: parsed.data.cert_type_id,
    })
  } catch (hookErr) {
    console.error(
      '[profile/certifications] onboarding hook failed (non-fatal):',
      (hookErr as Error)?.message,
    )
  }

  return NextResponse.json(
    {
      certification: {
        ...data,
        days_until_expiry: daysUntil(expiry),
        indicator: indicatorForStatus(status),
      },
    },
    { status: 201 },
  )
})
