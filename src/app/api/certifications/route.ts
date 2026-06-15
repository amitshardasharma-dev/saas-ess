// /api/certifications — list & create certifications with green/amber/red
// indicators. Scope mirrors /api/contracts: my | team | all.
//   my   -> caller's own employee record (any authenticated employee).
//   team -> caller's direct reports (manager+).
//   all  -> whole company (hr+).
// Module-gated on 'compliance'. Create auto-derives expiry from the cert type's
// validity, caches status, writes history + audit, schedules reminders, and
// best-effort advances onboarding for required cert types.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { hasMinRole } from '@/types/roles'
import { calcExpiry, calcStatus, daysUntil, indicatorForStatus } from '@/lib/compliance/expiry'
import { writeCertHistory, scheduleReminders } from '@/services/compliance'
import { completeLinkedOnboardingStep } from '@/lib/onboarding'
import { certificationCreateSchema } from '@/types/compliance'

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

export const GET = withAuth(async (request: NextRequest, ctx: AuthContext) => {
  const { companyId, employee, role } = ctx
  const moduleErr = await ensureModule(companyId)
  if (moduleErr) return moduleErr

  const scope = new URL(request.url).searchParams.get('scope') || 'my'

  let query = supabaseAdmin
    .from('ess_certifications')
    .select(`
      *,
      ess_employees!ess_certifications_employee_id_fkey ( full_name, employee_no ),
      ess_cert_types ( name )
    `)
    .eq('company_id', companyId)
    .order('expiry_date', { ascending: true })

  if (scope === 'my') {
    if (!employee) return NextResponse.json({ certifications: [] })
    query = query.eq('employee_id', employee.id)
  } else if (scope === 'team') {
    if (!hasMinRole(role, 'manager')) {
      return NextResponse.json({ error: 'Manager role required for scope=team' }, { status: 403 })
    }
    if (!employee) return NextResponse.json({ certifications: [] })
    const { data: reports } = await supabaseAdmin
      .from('ess_employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('reports_to', employee.id)
    const reportIds = (reports || []).map((r: { id: string }) => r.id)
    if (reportIds.length === 0) return NextResponse.json({ certifications: [] })
    query = query.in('employee_id', reportIds)
  } else if (scope === 'all') {
    if (!hasMinRole(role, 'hr')) {
      return NextResponse.json({ error: 'HR role required for scope=all' }, { status: 403 })
    }
    // company_id filter already applied
  } else {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }

  const { data, error } = await query
  if (error) {
    console.error('Certifications fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch certifications' }, { status: 500 })
  }

  const processed = (data || []).map((c: Record<string, unknown>) => {
    const emp = c.ess_employees as { full_name?: string; employee_no?: string } | null
    const ctype = c.ess_cert_types as { name?: string } | null
    const expiry = (c.expiry_date as string | null) ?? null
    const status = calcStatus(expiry)
    return {
      ...c,
      employee_name: emp?.full_name ?? null,
      employee_no: emp?.employee_no ?? null,
      cert_type_name: ctype?.name ?? null,
      status,
      days_until_expiry: daysUntil(expiry),
      indicator: indicatorForStatus(status),
      ess_employees: undefined,
      ess_cert_types: undefined,
    }
  })

  return NextResponse.json({ certifications: processed })
})

export const POST = withAuth(
  async (request: NextRequest, ctx: AuthContext) => {
    const { companyId, employee, appUser } = ctx
    const moduleErr = await ensureModule(companyId)
    if (moduleErr) return moduleErr

    const body = await request.json().catch(() => null)
    const parsed = certificationCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    // Resolve the cert type (must belong to this company) for validity + flags.
    let validityMonths: number | null = null
    let reminderOffsets: number[] = []
    if (parsed.data.cert_type_id) {
      const { data: certType, error: typeErr } = await supabaseAdmin
        .from('ess_cert_types')
        .select('id, validity_months, reminder_offsets, required')
        .eq('id', parsed.data.cert_type_id)
        .eq('company_id', companyId)
        .single()
      if (typeErr || !certType) {
        return NextResponse.json({ error: 'Unknown cert type' }, { status: 400 })
      }
      validityMonths = (certType.validity_months as number | null) ?? null
      reminderOffsets = (certType.reminder_offsets as number[] | null) ?? []
    }

    // Auto-derive expiry from completion + validity unless explicitly supplied.
    const completion = parsed.data.completion_date ?? null
    const expiry =
      parsed.data.expiry_date !== undefined && parsed.data.expiry_date !== null
        ? parsed.data.expiry_date
        : calcExpiry(completion, validityMonths)
    const status = calcStatus(expiry)

    const { data, error } = await supabaseAdmin
      .from('ess_certifications')
      .insert({
        company_id: companyId,
        employee_id: parsed.data.employee_id,
        cert_type_id: parsed.data.cert_type_id ?? null,
        title: parsed.data.title,
        completion_date: completion,
        expiry_date: expiry,
        status,
        // An hr+ create is authoritative — already validated, no review needed.
        verification_status: 'validated',
        notes: parsed.data.notes ?? null,
        created_by: employee?.id ?? null,
      })
      .select()
      .single()

    if (error || !data) {
      console.error('Certification create error:', error)
      return NextResponse.json({ error: 'Failed to create certification' }, { status: 500 })
    }

    await writeCertHistory({
      certificationId: data.id,
      action: 'created',
      performedBy: employee?.id ?? null,
    })

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'certification.created',
      target: { type: 'certification', id: data.id },
      meta: { status },
    })

    await scheduleReminders({
      companyId,
      certificationId: data.id,
      expiryDate: expiry,
      reminderOffsets,
    })

    // Auto-complete the linked onboarding step (certification -> this cert type).
    // Fires whenever the cert is tied to a type; no-op if the volunteer has no
    // matching auto_complete step. `required` no longer gates this — the linkage
    // (step.ref_id == cert_type_id) is what determines relevance.
    if (parsed.data.cert_type_id) {
      try {
        await completeLinkedOnboardingStep(parsed.data.employee_id, {
          stepType: 'certification',
          refId: parsed.data.cert_type_id,
        })
      } catch (hookErr) {
        console.error('[certifications] onboarding hook failed (non-fatal):', (hookErr as Error)?.message)
      }
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
  },
  { minRole: 'hr' },
)
