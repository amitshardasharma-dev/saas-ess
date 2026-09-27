// /api/training/modules/:id/certificate — a downloadable Certificate of
// Completion (ISS-006). Generated on demand for the signed-in learner, only if
// they have actually completed the module. Cross-tenant / not-completed -> 404/403.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveOrgName } from '@/lib/branding'
import { renderCertificatePdf, formatCompletionDate } from '@/lib/certificates/render'
import { getTemplateInEffect } from '@/lib/certificates/template'

export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext, params) => {
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Module ID required' }, { status: 400 })
    if (!ctx.employee) return NextResponse.json({ error: 'No employee record' }, { status: 403 })

    const { data: mod } = await supabaseAdmin
      .from('ess_training_modules')
      .select('title')
      .eq('id', id)
      .eq('company_id', ctx.companyId)
      .single()
    if (!mod) return NextResponse.json({ error: 'Module not found' }, { status: 404 })

    const { data: prog } = await supabaseAdmin
      .from('ess_training_progress')
      .select('status, completed_at')
      .eq('company_id', ctx.companyId)
      .eq('employee_id', ctx.employee.id)
      .eq('module_id', id)
      .maybeSingle()
    if (!prog || prog.status !== 'complete') {
      return NextResponse.json({ error: 'Complete this training to download your certificate.' }, { status: 403 })
    }

    const org = await resolveOrgName(ctx.companyId)
    const learner = ctx.employee.full_name || 'Volunteer'
    const moduleTitle = (mod as { title?: string }).title ?? 'Training'
    const completedAt = (prog as { completed_at?: string | null }).completed_at ?? null

    // MOS-721: use the tenant's template that was in effect when the learner
    // completed, so later template edits never change an issued certificate.
    const template = await getTemplateInEffect(ctx.companyId, completedAt)
    const bytes = await renderCertificatePdf(template?.config ?? null, {
      orgName: org,
      learnerName: learner,
      moduleTitle,
      completedOn: formatCompletionDate(completedAt),
    })
    const safe = moduleTitle.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificate-${safe || 'training'}.pdf"`,
      },
    })
  },
  { minRole: 'employee' },
)
