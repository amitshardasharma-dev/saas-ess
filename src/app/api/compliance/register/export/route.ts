// /api/compliance/register/export — CSV of every person's required certificates
// + trainings and their status (hr+). One row per (person, item) for easy
// filtering/pivoting, so staff can see at a glance who has completed what.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { type UserRole } from '@/types/roles'
import { buildRegister, type RegisterEmployee } from '@/lib/compliance/register'

const TIER: Record<string, string> = { employee: 'Volunteer', manager: 'Staff', hr: 'Staff', admin: 'Admin' }

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const GET = withAuth(
  async (_request: NextRequest, ctx: AuthContext) => {
    try {
      await assertModuleEnabled(ctx.companyId, 'compliance')
    } catch (err) {
      if (err instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
      throw err
    }

    const { data: users } = await supabaseAdmin
      .from('ess_app_users')
      .select('id, role, is_active')
      .eq('company_id', ctx.companyId)
      .eq('is_active', true)
    const roleByAppUser = new Map<string, UserRole>()
    for (const u of users ?? []) roleByAppUser.set(u.id as string, (u as { role?: string }).role as UserRole)

    const { data: emps } = await supabaseAdmin
      .from('ess_employees')
      .select('id, full_name, app_user_id')
      .eq('company_id', ctx.companyId)
    const employees: RegisterEmployee[] = (emps ?? [])
      .map((e) => {
        const appUserId = (e as { app_user_id?: string | null }).app_user_id
        const role = appUserId ? roleByAppUser.get(appUserId) : undefined
        if (!role) return null
        return { id: e.id as string, name: (e as { full_name?: string }).full_name ?? null, role }
      })
      .filter((x): x is RegisterEmployee => x !== null)

    const people = await buildRegister(ctx.companyId, employees)

    const lines: string[] = ['Name,Tier,Category,Item,Status,Compliant']
    for (const p of people) {
      if (p.total === 0) continue
      for (const c of p.certificates) {
        lines.push([p.name ?? '', TIER[p.role] ?? p.role, 'Certificate', c.name, c.label, c.color === 'green' ? 'Yes' : 'No'].map(csvCell).join(','))
      }
      for (const t of p.trainings) {
        lines.push([p.name ?? '', TIER[p.role] ?? p.role, 'Training', t.title, t.label, t.color === 'green' ? 'Yes' : 'No'].map(csvCell).join(','))
      }
    }

    return new NextResponse(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="compliance-register.csv"',
      },
    })
  },
  { minRole: 'hr' },
)
