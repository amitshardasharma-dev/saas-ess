// /api/compliance/register — the Compliance Document Register.
//   GET (default scope=my)  -> the caller's required certs + trainings + status.
//   GET ?scope=all (hr+)    -> per-person compliance across the company (overview).
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { hasMinRole, type UserRole } from '@/types/roles'
import { buildRegister, type RegisterEmployee } from '@/lib/compliance/register'

async function ensureModule(companyId: string): Promise<NextResponse | null> {
  try {
    await assertModuleEnabled(companyId, 'compliance')
    return null
  } catch (err) {
    if (err instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    throw err
  }
}

export const GET = withAuth(async (request: NextRequest, ctx: AuthContext) => {
  const moduleErr = await ensureModule(ctx.companyId)
  if (moduleErr) return moduleErr

  const scope = new URL(request.url).searchParams.get('scope') || 'my'

  if (scope === 'all') {
    if (!hasMinRole(ctx.role, 'hr')) {
      return NextResponse.json({ error: 'HR role required for scope=all' }, { status: 403 })
    }
    // All active employees with their role (joined via app_user).
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
        if (!role) return null // inactive / no app_user -> excluded
        return { id: e.id as string, name: (e as { full_name?: string }).full_name ?? null, role }
      })
      .filter((x): x is RegisterEmployee => x !== null)

    const people = await buildRegister(ctx.companyId, employees)
    // Surface those with outstanding items first.
    people.sort((a, b) => b.pending - a.pending || (a.name ?? '').localeCompare(b.name ?? ''))
    return NextResponse.json({ people })
  }

  // scope=my
  if (!ctx.employee) return NextResponse.json({ me: null })
  const [me] = await buildRegister(ctx.companyId, [
    { id: ctx.employee.id, name: ctx.employee.full_name, role: ctx.role },
  ])
  return NextResponse.json({ me: me ?? null })
})
