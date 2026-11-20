// POST /api/onboarding/approval — approve a person, or take the approval back (admin).
// Body: { employee_id, action: 'approve' | 'revoke' }
//   approve: only when every mandatory step is done or marked not needed.
//            The person gets an email (after the response).
//   revoke : the status returns to what the steps say.
import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'
import { approveOnboarding, revokeOnboardingApproval } from '@/lib/onboarding'
import { sendOnboardingApprovedEmail } from '@/lib/email/onboarding-approved'

const schema = z.object({ employee_id: z.string().uuid(), action: z.enum(['approve', 'revoke']) }).strict()

export const POST = withAuth(
  async (req: NextRequest, { companyId, appUser }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    const { employee_id: employeeId, action } = parsed.data

    const { data: emp } = await supabaseAdmin
      .from('ess_employees')
      .select('id, full_name, email')
      .eq('company_id', companyId)
      .eq('id', employeeId)
      .maybeSingle()
    if (!emp) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

    if (action === 'approve') {
      const res = await approveOnboarding(companyId, employeeId, appUser.id)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
      await recordAudit({
        companyId,
        actorId: appUser.id,
        action: 'onboarding.approved',
        target: { type: 'employee', id: employeeId },
        meta: { name: emp.full_name },
      })
      after(() => sendOnboardingApprovedEmail({ companyId, to: (emp.email as string | null) ?? null, name: (emp.full_name as string) ?? '' }))
      return NextResponse.json({ status: 'approved', approved_at: res.approvedAt })
    }

    const res = await revokeOnboardingApproval(companyId, employeeId)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'onboarding.approval_revoked',
      target: { type: 'employee', id: employeeId },
      meta: { name: emp.full_name, status: res.status },
    })
    return NextResponse.json({ status: res.status, approved_at: null })
  },
  { minRole: 'admin' },
)
