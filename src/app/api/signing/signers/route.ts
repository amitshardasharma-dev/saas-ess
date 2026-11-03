// GET /api/signing/signers  (hr+, MOS-720)
// People who can be named as a signer in the field designer. Staff first.
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'

const STAFF = new Set(['super_admin', 'admin', 'hr', 'manager', 'staff'])

export const GET = withAuth(
  async (_request, { companyId }) => {
    const { data: employees } = await supabaseAdmin
      .from('ess_employees')
      .select('id, full_name, designation, app_user_id')
      .eq('company_id', companyId)
    const rows = (employees ?? []) as Array<{ id: string; full_name: string | null; designation: string | null; app_user_id: string | null }>
    const appIds = rows.map((r) => r.app_user_id).filter((x): x is string => !!x)
    const roles = new Map<string, { role: string; active: boolean }>()
    if (appIds.length) {
      const { data: users } = await supabaseAdmin.from('ess_app_users').select('id, role, is_active').eq('company_id', companyId).in('id', appIds)
      for (const u of (users ?? []) as Array<{ id: string; role: string; is_active: boolean }>) roles.set(u.id, { role: u.role, active: u.is_active })
    }
    const people = rows
      .map((r) => {
        const u = r.app_user_id ? roles.get(r.app_user_id) : undefined
        return { id: r.id, name: r.full_name || 'Unnamed', designation: r.designation, role: u?.role ?? 'employee', active: u?.active !== false, staff: STAFF.has(u?.role ?? '') }
      })
      .filter((p) => p.active)
      .sort((a, b) => Number(b.staff) - Number(a.staff) || a.name.localeCompare(b.name))
    return NextResponse.json({ people })
  },
  { minRole: 'hr' },
)
