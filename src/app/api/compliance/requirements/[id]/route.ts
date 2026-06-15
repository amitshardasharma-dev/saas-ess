// /api/compliance/requirements/:id — remove a requirement (admin only).
// Company-scoped delete; a foreign id simply affects no rows.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'

export const DELETE = withAuth(
  async (_request: NextRequest, ctx: AuthContext, params) => {
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Requirement ID required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('ess_compliance_requirements')
      .delete()
      .eq('id', id)
      .eq('company_id', ctx.companyId)
      .select('id')
      .maybeSingle()
    if (error) {
      console.error('Requirement delete error:', error)
      return NextResponse.json({ error: 'Failed to remove requirement' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Requirement not found' }, { status: 404 })

    await recordAudit({
      companyId: ctx.companyId,
      actorId: ctx.appUser.id,
      action: 'compliance.requirement_removed',
      target: { type: 'compliance_requirement', id },
    })
    return NextResponse.json({ ok: true })
  },
  { minRole: 'admin' },
)
