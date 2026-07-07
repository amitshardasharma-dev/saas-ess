import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-server'
import { initOnboarding } from '@/lib/onboarding'
import { sendInvitationEmail } from '@/lib/email/invitation'
import type { UserRole } from '@/types/roles'
import type { OnboardingStatus } from '@/lib/onboarding'

/**
 * Admin user-profile provisioning + management.
 *
 * createPerson: provisions a new auth user -> ess_app_users -> ess_employees and
 * initialises onboarding (idempotent). Company-scoped by the caller's companyId.
 * updatePerson: edits a person in the caller's company (name/department/role/active);
 * a foreign-tenant employee id resolves to 404 (no existence leak).
 *
 * Roles assignable by an admin (super-admin is the platform-level is_super_admin
 * flag and is intentionally NOT assignable here).
 */
const ASSIGNABLE_ROLES: UserRole[] = ['employee', 'manager', 'hr', 'admin']

export interface PersonSummary {
  id: string
  name: string
  email: string | null
  role: UserRole
  orgUnit: string | null
  onboardingStatus: OnboardingStatus
  isActive: boolean
}

type Fail = { ok: false; status: number; error: string }
type CreateOk = { ok: true; person: PersonSummary; tempPassword?: string }
type UpdateOk = { ok: true; person: PersonSummary }

export interface PersonDetail {
  id: string
  name: string
  email: string | null
  phone: string | null
  employeeNo: string | null
  department: string | null
  designation: string | null
  status: string | null
  dateOfJoining: string | null
  role: UserRole
  isActive: boolean
  onboarding: {
    status: OnboardingStatus
    completedAt: string | null
    steps: { id: string; title: string; description: string | null; status: string; sortOrder: number; completedAt: string | null }[]
  }
  certifications: { id: string; title: string; status: string; completionDate: string | null; expiryDate: string | null }[]
  documents: { id: string; title: string; signedAt: string }[]
  training: { moduleId: string; title: string; percent: number; status: string; completedAt: string | null }[]
  activity: { action: string; at: string; meta: Record<string, unknown> }[]
}

/**
 * Aggregate a single volunteer's complete record (company-scoped). Returns null
 * for a missing / foreign-tenant id (caller maps to 404 — no existence leak).
 */
export async function getPersonDetail(employeeId: string, companyId: string): Promise<PersonDetail | null> {
  const { data: emp } = await supabaseAdmin
    .from('ess_employees')
    .select('id, full_name, email, phone, employee_no, department, designation, status, date_of_joining, app_user_id')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!emp) return null

  const [{ data: au }, { data: state }, { data: steps }, { data: certs }, { data: signed }, { data: training }, { data: activity }] =
    await Promise.all([
      supabaseAdmin.from('ess_app_users').select('role, is_active').eq('id', emp.app_user_id ?? '').maybeSingle(),
      supabaseAdmin.from('ess_onboarding_states').select('status, completed_at').eq('company_id', companyId).eq('employee_id', employeeId).maybeSingle(),
      supabaseAdmin.from('ess_onboarding_steps').select('id, title, description, status, sort_order, completed_at').eq('company_id', companyId).eq('employee_id', employeeId).order('sort_order', { ascending: true }),
      supabaseAdmin.from('ess_certifications').select('id, title, status, completion_date, expiry_date').eq('company_id', companyId).eq('employee_id', employeeId).order('expiry_date', { ascending: true, nullsFirst: false }),
      supabaseAdmin.from('ess_signed_documents').select('id, signed_at, ess_documents ( title )').eq('company_id', companyId).eq('employee_id', employeeId).order('signed_at', { ascending: false }),
      supabaseAdmin.from('ess_training_progress').select('module_id, percent_complete, status, completed_at, ess_training_modules ( title )').eq('company_id', companyId).eq('employee_id', employeeId),
      supabaseAdmin.from('ess_audit_log').select('action, created_at, meta').eq('company_id', companyId).eq('target_id', employeeId).order('created_at', { ascending: false }).limit(20),
    ])

  return {
    id: emp.id,
    name: emp.full_name ?? '(unnamed)',
    email: emp.email ?? null,
    phone: emp.phone ?? null,
    employeeNo: emp.employee_no ?? null,
    department: emp.department ?? null,
    designation: emp.designation ?? null,
    status: emp.status ?? null,
    dateOfJoining: emp.date_of_joining ?? null,
    role: (au?.role as UserRole) ?? 'employee',
    isActive: au?.is_active ?? true,
    onboarding: {
      status: (state?.status as OnboardingStatus) ?? 'not_started',
      completedAt: state?.completed_at ?? null,
      steps: (steps ?? []).map((s) => ({
        id: s.id, title: s.title, description: s.description ?? null, status: s.status, sortOrder: s.sort_order, completedAt: s.completed_at ?? null,
      })),
    },
    certifications: (certs ?? []).map((c) => ({
      id: c.id, title: c.title, status: c.status, completionDate: c.completion_date ?? null, expiryDate: c.expiry_date ?? null,
    })),
    documents: (signed ?? []).map((d) => ({
      id: d.id, title: (d.ess_documents as { title?: string } | null)?.title ?? 'Signed document', signedAt: d.signed_at,
    })),
    training: (training ?? []).map((t) => ({
      moduleId: t.module_id, title: (t.ess_training_modules as { title?: string } | null)?.title ?? 'Module', percent: Number(t.percent_complete) || 0, status: t.status, completedAt: t.completed_at ?? null,
    })),
    activity: (activity ?? []).map((a) => ({ action: a.action, at: a.created_at, meta: (a.meta as Record<string, unknown>) ?? {} })),
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function genTempPassword(): string {
  return `Tmp-${randomBytes(6).toString('hex')}A1!`
}

export async function createPerson(input: {
  companyId: string
  email?: unknown
  full_name?: unknown
  role?: unknown
  department?: unknown
  password?: unknown
}): Promise<CreateOk | Fail> {
  const { companyId } = input
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : ''
  const department = typeof input.department === 'string' && input.department.trim() ? input.department.trim() : 'Volunteers'
  const role = (typeof input.role === 'string' ? input.role : 'employee') as UserRole
  const suppliedPassword = typeof input.password === 'string' ? input.password : undefined

  if (!EMAIL_RE.test(email)) return { ok: false, status: 400, error: 'A valid email is required' }
  if (!fullName) return { ok: false, status: 400, error: 'full_name is required' }
  if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, status: 400, error: `role must be one of ${ASSIGNABLE_ROLES.join(', ')}` }
  if (suppliedPassword !== undefined && suppliedPassword.length < 8) {
    return { ok: false, status: 400, error: 'password must be at least 8 characters' }
  }

  // Reject if an auth user already exists for this email (keeps the one-app-user
  // -per-auth-user invariant the login path relies on; avoids cross-tenant mixups).
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (list?.users?.some((u) => u.email?.toLowerCase() === email)) {
    return { ok: false, status: 409, error: 'A user with this email already exists' }
  }

  const password = suppliedPassword ?? genTempPassword()
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError || !authData.user) {
    return { ok: false, status: 500, error: `Failed to create auth user: ${authError?.message ?? 'unknown'}` }
  }
  const authUserId = authData.user.id

  const { data: appUser, error: appErr } = await supabaseAdmin
    .from('ess_app_users')
    .insert({ auth_user_id: authUserId, company_id: companyId, role, is_super_admin: false, is_active: true })
    .select('id')
    .single()
  if (appErr || !appUser) {
    // Roll back the orphaned auth user so a retry can succeed.
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {})
    return { ok: false, status: 500, error: `Failed to create app user: ${appErr?.message ?? 'unknown'}` }
  }

  // Per-company sequential employee number.
  const { count } = await supabaseAdmin
    .from('ess_employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
  const empNo = `EMP-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data: employee, error: empErr } = await supabaseAdmin
    .from('ess_employees')
    .insert({ app_user_id: appUser.id, company_id: companyId, full_name: fullName, email, employee_no: empNo, department })
    .select('id')
    .single()
  if (empErr || !employee) {
    await supabaseAdmin.from('ess_app_users').delete().eq('id', appUser.id)
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {})
    return { ok: false, status: 500, error: `Failed to create employee: ${empErr?.message ?? 'unknown'}` }
  }

  await initOnboarding(employee.id, companyId, role)

  // ISS-001: send the onboarding invitation email (best-effort — a failed send
  // never blocks account creation; no-ops in dev without MAILRELAY_API_KEY).
  await sendInvitationEmail({ companyId, to: email, name: fullName, tempPassword: password })

  return {
    ok: true,
    person: {
      id: employee.id,
      name: fullName,
      email,
      role,
      orgUnit: department,
      onboardingStatus: 'not_started',
      isActive: true,
    },
    // Only surfaced when WE generated it (so the admin can relay it).
    tempPassword: suppliedPassword === undefined ? password : undefined,
  }
}

export async function updatePerson(
  employeeId: string,
  companyId: string,
  patch: { full_name?: unknown; department?: unknown; role?: unknown; is_active?: unknown },
  actorAppUserId: string
): Promise<UpdateOk | Fail> {
  // Tenant scoping: a foreign-tenant id resolves to 404.
  const { data: employee } = await supabaseAdmin
    .from('ess_employees')
    .select('id, app_user_id, company_id, full_name, email, department')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!employee) return { ok: false, status: 404, error: 'Person not found' }

  const isSelf = employee.app_user_id === actorAppUserId

  const empUpdate: Record<string, unknown> = {}
  if (typeof patch.full_name === 'string' && patch.full_name.trim()) empUpdate.full_name = patch.full_name.trim()
  if (typeof patch.department === 'string' && patch.department.trim()) empUpdate.department = patch.department.trim()

  const appUpdate: Record<string, unknown> = {}
  if (patch.role !== undefined) {
    const role = patch.role as UserRole
    if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, status: 400, error: `role must be one of ${ASSIGNABLE_ROLES.join(', ')}` }
    if (isSelf) return { ok: false, status: 400, error: 'You cannot change your own role' }
    appUpdate.role = role
  }
  if (patch.is_active !== undefined) {
    if (typeof patch.is_active !== 'boolean') return { ok: false, status: 400, error: 'is_active must be a boolean' }
    if (isSelf && patch.is_active === false) return { ok: false, status: 400, error: 'You cannot deactivate your own account' }
    appUpdate.is_active = patch.is_active
  }

  if (Object.keys(empUpdate).length > 0) {
    empUpdate.updated_at = new Date().toISOString()
    const { error } = await supabaseAdmin.from('ess_employees').update(empUpdate).eq('id', employee.id).eq('company_id', companyId)
    if (error) return { ok: false, status: 500, error: error.message }
  }
  if (Object.keys(appUpdate).length > 0 && employee.app_user_id) {
    const { error } = await supabaseAdmin.from('ess_app_users').update(appUpdate).eq('id', employee.app_user_id).eq('company_id', companyId)
    if (error) return { ok: false, status: 500, error: error.message }
  }

  // Read back the resolved role + active flag.
  const { data: appUser } = await supabaseAdmin
    .from('ess_app_users')
    .select('role, is_active')
    .eq('id', employee.app_user_id ?? '')
    .maybeSingle()
  const { data: onb } = await supabaseAdmin
    .from('ess_onboarding_states')
    .select('status')
    .eq('company_id', companyId)
    .eq('employee_id', employee.id)
    .maybeSingle()

  return {
    ok: true,
    person: {
      id: employee.id,
      name: (empUpdate.full_name as string) ?? employee.full_name ?? '(unnamed)',
      email: employee.email ?? null,
      role: (appUser?.role as UserRole) ?? 'employee',
      orgUnit: (empUpdate.department as string) ?? employee.department ?? null,
      onboardingStatus: (onb?.status as OnboardingStatus) ?? 'not_started',
      isActive: appUser?.is_active ?? true,
    },
  }
}
