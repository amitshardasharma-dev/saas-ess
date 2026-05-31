// /api/certifications/:id — update / renew / delete a certification.
// Renew = supplying new completion/expiry dates (or renew:true); history action
// becomes 'renewed' and (for required types) onboarding is advanced. Cross-tenant
// ids return 404 (no IDOR) because every lookup is scoped by company_id.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { calcStatus, daysUntil, indicatorForStatus } from '@/lib/compliance/expiry'
import { writeCertHistory, scheduleReminders, maybeAdvanceOnboarding } from '@/services/compliance'
import { certificationUpdateSchema } from '@/types/compliance'

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

export const PATCH = withAuth(
  async (request: NextRequest, ctx: AuthContext, params) => {
    const { companyId, employee, appUser } = ctx
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

    const moduleErr = await ensureModule(companyId)
    if (moduleErr) return moduleErr

    const body = await request.json().catch(() => null)
    const parsed = certificationUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    // Tenant-scoped fetch — a cross-tenant id yields no row -> 404 (no IDOR).
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('ess_certifications')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()
    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
    }

    const datesChanged =
      (parsed.data.completion_date !== undefined &&
        parsed.data.completion_date !== existing.completion_date) ||
      (parsed.data.expiry_date !== undefined && parsed.data.expiry_date !== existing.expiry_date)
    const isRenewal = parsed.data.renew === true || datesChanged

    const nextExpiry =
      parsed.data.expiry_date !== undefined ? parsed.data.expiry_date : existing.expiry_date
    const nextStatus = calcStatus(nextExpiry)

    const update: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.title !== undefined) update.title = parsed.data.title
    if (parsed.data.completion_date !== undefined) update.completion_date = parsed.data.completion_date
    if (parsed.data.expiry_date !== undefined) update.expiry_date = parsed.data.expiry_date
    if (parsed.data.notes !== undefined) update.notes = parsed.data.notes

    const { data, error } = await supabaseAdmin
      .from('ess_certifications')
      .update(update)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single()

    if (error || !data) {
      console.error('Certification update error:', error)
      return NextResponse.json({ error: 'Failed to update certification' }, { status: 500 })
    }

    await writeCertHistory({
      certificationId: data.id,
      action: isRenewal ? 'renewed' : 'recertified',
      performedBy: employee?.id ?? null,
      notes: isRenewal ? null : 'Details updated',
    })

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: isRenewal ? 'certification.renewed' : 'certification.updated',
      target: { type: 'certification', id: data.id },
      meta: { status: nextStatus },
    })

    if (isRenewal && existing.cert_type_id) {
      const { data: certType } = await supabaseAdmin
        .from('ess_cert_types')
        .select('required, reminder_offsets')
        .eq('id', existing.cert_type_id)
        .eq('company_id', companyId)
        .single()

      await scheduleReminders({
        companyId,
        certificationId: data.id,
        expiryDate: nextExpiry,
        reminderOffsets: (certType?.reminder_offsets as number[] | null) ?? [],
      })

      if (certType?.required) {
        await maybeAdvanceOnboarding(existing.employee_id)
      }
    }

    return NextResponse.json({
      certification: {
        ...data,
        days_until_expiry: daysUntil(nextExpiry),
        indicator: indicatorForStatus(nextStatus),
      },
    })
  },
  { minRole: 'hr' },
)

export const DELETE = withAuth(
  async (_request: NextRequest, ctx: AuthContext, params) => {
    const { companyId, employee, appUser } = ctx
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

    const moduleErr = await ensureModule(companyId)
    if (moduleErr) return moduleErr

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('ess_certifications')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()
    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
    }

    // Record history BEFORE the delete (FK cascade would drop child rows).
    await writeCertHistory({
      certificationId: existing.id,
      action: 'revoked',
      performedBy: employee?.id ?? null,
    })

    const { error } = await supabaseAdmin
      .from('ess_certifications')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)

    if (error) {
      console.error('Certification delete error:', error)
      return NextResponse.json({ error: 'Failed to delete certification' }, { status: 500 })
    }

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'certification.deleted',
      target: { type: 'certification', id: existing.id },
    })

    return NextResponse.json({ message: 'Certification deleted successfully' })
  },
  { minRole: 'hr' },
)
