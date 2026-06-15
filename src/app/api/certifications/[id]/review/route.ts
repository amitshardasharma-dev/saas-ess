// /api/certifications/:id/review — reviewer (hr+) decision on a certification.
// POST { action: 'validate' | 'reject' | 'request_changes', expiry_date?, message? }
//   - sets verification_status (+ verified_by / verified_at)
//   - optionally overrides the expiry (recomputing the traffic-light status)
//   - records the decision as a reviewer message in the cert thread
//   - notifies the cert owner in their inbox
// Cross-tenant id -> 404 (company-scoped lookup). hr+ only.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { calcStatus, daysUntil, indicatorForStatus } from '@/lib/compliance/expiry'
import { writeCertHistory } from '@/services/compliance'
import { certReviewSchema, type VerificationStatus } from '@/types/compliance'
import { loadCert, loadCertThread, addCertMessage, notifyOwnerOfReview } from '@/lib/compliance/review'

const ACTION_STATUS: Record<'validate' | 'reject' | 'request_changes', Exclude<VerificationStatus, 'pending' | 'submitted'>> = {
  validate: 'validated',
  reject: 'rejected',
  request_changes: 'changes_requested',
}

const DEFAULT_NOTE: Record<'validate' | 'reject' | 'request_changes', string> = {
  validate: 'Certificate approved.',
  reject: 'Certificate was not accepted.',
  request_changes: 'Changes requested — please review and resubmit.',
}

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

export const POST = withAuth(
  async (request: NextRequest, ctx: AuthContext, params) => {
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

    const moduleErr = await ensureModule(ctx.companyId)
    if (moduleErr) return moduleErr

    const cert = await loadCert(ctx.companyId, id)
    if (!cert) return NextResponse.json({ error: 'Certification not found' }, { status: 404 })

    const body = await request.json().catch(() => null)
    const parsed = certReviewSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const { action } = parsed.data
    const newStatus = ACTION_STATUS[action]

    // Build the update. An expiry override recomputes the traffic-light status.
    const update: Record<string, unknown> = {
      verification_status: newStatus,
      verified_by: ctx.appUser.id,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const expiryChanged = parsed.data.expiry_date !== undefined
    const newExpiry = expiryChanged ? parsed.data.expiry_date ?? null : cert.expiry_date
    if (expiryChanged) {
      update.expiry_date = newExpiry
      update.status = calcStatus(newExpiry)
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('ess_certifications')
      .update(update)
      .eq('id', cert.id)
      .eq('company_id', ctx.companyId)
      .select()
      .single()
    if (updErr || !updated) {
      console.error('Cert review update error:', updErr)
      return NextResponse.json({ error: 'Failed to update certification' }, { status: 500 })
    }

    // Record the decision in the thread (always — so the trail captures it).
    const note = parsed.data.message?.trim() || DEFAULT_NOTE[action]
    await addCertMessage({
      companyId: ctx.companyId,
      certificationId: cert.id,
      authorAppUserId: ctx.appUser.id,
      authorKind: 'reviewer',
      body: note,
    })

    if (expiryChanged) {
      await writeCertHistory({ certificationId: cert.id, action: 'renewed', performedBy: ctx.employee?.id ?? null })
    }

    await recordAudit({
      companyId: ctx.companyId,
      actorId: ctx.appUser.id,
      action: 'certification.reviewed',
      target: { type: 'certification', id: cert.id },
      meta: { action, status: newStatus, expiryChanged },
    })

    // Tell the owner in their inbox.
    await notifyOwnerOfReview({
      companyId: ctx.companyId,
      employeeId: cert.employee_id,
      reviewerAppUserId: ctx.appUser.id,
      certTitle: cert.title,
      status: newStatus,
      message: parsed.data.message?.trim() || undefined,
    })

    return NextResponse.json({
      certification: {
        ...updated,
        days_until_expiry: daysUntil(newExpiry),
        indicator: indicatorForStatus(calcStatus(newExpiry)),
      },
      messages: await loadCertThread(cert.id),
    })
  },
  { minRole: 'hr' },
)
