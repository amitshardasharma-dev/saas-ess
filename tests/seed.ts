// E2E fixture seeder for the Volunteer Management platform.
// Creates, per test agent (A/B/C), one user of each of the 4 role tiers plus a
// pool of volunteer profiles in varied onboarding states. Also supports a 250-
// profile scale seed. Writes credentials to tests/fixtures/users.json (gitignored).
//
// Run: npx tsx tests/seed.ts            (base fixtures)
//      npx tsx tests/seed.ts --scale    (also seed 250 volunteers for A6)
//
// Role tier mapping (underlying role + is_super_admin flag -> display tier):
//   super_admin : role=admin,    is_super_admin=true   -> "Super Admin"
//   admin       : role=admin,    is_super_admin=false  -> "Admin"
//   staff       : role=hr,       is_super_admin=false   -> "Staff"
//   volunteer   : role=employee, is_super_admin=false   -> "Volunteer"

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually (no dotenv dep guaranteed).
const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
const getEnv = (k: string) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'))
  return m ? m[1].trim() : ''
}
const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const PASSWORD = 'Test1234!'
const ACME_SLUG = 'acme-corp'

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Tier = 'super_admin' | 'admin' | 'staff' | 'volunteer'
const TIER_ROLE: Record<Tier, { role: string; superAdmin: boolean }> = {
  super_admin: { role: 'admin', superAdmin: true },
  admin: { role: 'admin', superAdmin: false },
  staff: { role: 'hr', superAdmin: false },
  volunteer: { role: 'employee', superAdmin: false },
}

async function getAcmeCompanyId(): Promise<string> {
  const { data } = await sb.from('ess_companies').select('id').eq('slug', ACME_SLUG).single()
  if (!data) throw new Error('Acme company not found')
  return data.id
}

// Create/find a dedicated SEED tenant (slug prefixed e2e-) — never a real one.
async function ensureSeedTenant(slug: string, name: string): Promise<string> {
  const { data: existing } = await sb.from('ess_companies').select('id').eq('slug', slug).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await sb
    .from('ess_companies')
    .insert({ name, slug, settings: { modules_enabled: ['leave', 'expense', 'documents'] } })
    .select('id')
    .single()
  if (error) throw new Error(`seed tenant ${slug}: ${error.message}`)
  return data.id
}

// Seed a leave application owned by tenant B so isolation tests have a real
// foreign-tenant record id to probe (expect 404 from an Acme caller).
async function seedTenantBArtifacts(companyId: string, employeeId: string) {
  // a leave type for tenant B
  const { data: lt } = await sb
    .from('ess_leave_types')
    .upsert({ company_id: companyId, name: 'Annual Leave', code: 'AL', eligible_days: 20 }, { onConflict: 'company_id,code' })
    .select('id')
    .maybeSingle()
  // NOTE: ess_leave_applications is EMPLOYEE-scoped (no company_id column);
  // tenant is derived via the employee. Do not insert company_id here.
  let leaveId: string | null = null
  const { data: existingLeave } = await sb
    .from('ess_leave_applications')
    .select('id')
    .eq('employee_id', employeeId)
    .maybeSingle()
  if (existingLeave) leaveId = existingLeave.id
  else {
    const { data, error } = await sb
      .from('ess_leave_applications')
      .insert({
        employee_id: employeeId, leave_type_id: lt?.id ?? null,
        from_date: '2026-07-01', till_date: '2026-07-03', total_days: 3,
        reason: 'tenant-b isolation fixture', status: 'Pending Approval',
        display_id: 'TB-LA-001',
      })
      .select('id')
      .maybeSingle()
    if (error) console.warn('  (tenant-b leave insert skipped:', error.message + ')')
    if (!error && data) leaveId = data.id
  }

  // A tenant-B expense claim — the cross-tenant fixture for the isolation sweep
  // (probed by an Acme caller, must 404). ess_expense_claims is employee-scoped.
  let expenseClaimId: string | null = null
  const { data: existingClaim } = await sb
    .from('ess_expense_claims')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('display_id', 'TB-EC-001')
    .maybeSingle()
  if (existingClaim) expenseClaimId = existingClaim.id
  else {
    const { data, error } = await sb
      .from('ess_expense_claims')
      .insert({
        employee_id: employeeId, display_id: 'TB-EC-001',
        title: 'tenant-b isolation fixture', total_amount: 0, status: 'Draft',
      })
      .select('id')
      .maybeSingle()
    if (error) console.warn('  (tenant-b expense insert skipped:', error.message + ')')
    if (!error && data) expenseClaimId = data.id
  }

  return { leaveApplicationId: leaveId, employeeId, expenseClaimId }
}

async function ensureAuthUser(email: string): Promise<string> {
  // Find existing
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users?.find((u) => u.email === email)
  if (existing) {
    await sb.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true })
    return existing.id
  }
  const { data, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`)
  return data.user.id
}

async function upsertAppUserAndEmployee(opts: {
  companyId: string
  authUserId: string
  email: string
  fullName: string
  role: string
  superAdmin: boolean
  department?: string
  empNo: string
}) {
  const { companyId, authUserId, email, fullName, role, superAdmin, department, empNo } = opts

  // app_user
  const { data: existingAU } = await sb
    .from('ess_app_users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  let appUserId: string
  if (existingAU) {
    appUserId = existingAU.id
    await sb.from('ess_app_users').update({ role, is_super_admin: superAdmin, is_active: true, company_id: companyId }).eq('id', appUserId)
  } else {
    const { data, error } = await sb
      .from('ess_app_users')
      .insert({ auth_user_id: authUserId, company_id: companyId, role, is_super_admin: superAdmin, is_active: true })
      .select('id')
      .single()
    if (error) throw new Error(`app_user ${email}: ${error.message}`)
    appUserId = data.id
  }

  // employee
  const { data: existingEmp } = await sb
    .from('ess_employees')
    .select('id')
    .eq('app_user_id', appUserId)
    .maybeSingle()

  let employeeId: string
  if (existingEmp) {
    employeeId = existingEmp.id
    await sb.from('ess_employees').update({ full_name: fullName, email, department: department ?? 'Volunteers' }).eq('id', employeeId)
  } else {
    const { data, error } = await sb
      .from('ess_employees')
      .insert({ app_user_id: appUserId, company_id: companyId, full_name: fullName, email, employee_no: empNo, department: department ?? 'Volunteers' })
      .select('id')
      .single()
    if (error) throw new Error(`employee ${email}: ${error.message}`)
    employeeId = data.id
  }
  return { appUserId, employeeId }
}

const STEP_TEMPLATE = [
  { title: 'Complete your profile', sort_order: 0 },
  { title: 'Review the volunteer handbook', sort_order: 1 },
  { title: 'Sign required documents', sort_order: 2 },
  { title: 'Meet your team', sort_order: 3 },
]

// doneCount: how many leading steps are marked done -> drives computed status.
async function seedOnboarding(companyId: string, employeeId: string, doneCount: number, blocked = false) {
  // wipe existing for idempotency
  await sb.from('ess_onboarding_steps').delete().eq('employee_id', employeeId)
  await sb.from('ess_onboarding_states').delete().eq('employee_id', employeeId)

  const rows = STEP_TEMPLATE.map((s, i) => ({
    company_id: companyId,
    employee_id: employeeId,
    title: s.title,
    description: s.title,
    sort_order: s.sort_order,
    status: i < doneCount ? 'done' : 'pending',
    completed_at: i < doneCount ? new Date().toISOString() : null,
  }))
  await sb.from('ess_onboarding_steps').insert(rows)

  const allDone = doneCount >= STEP_TEMPLATE.length
  const status = blocked ? 'blocked' : allDone ? 'completed' : doneCount > 0 ? 'in_progress' : 'not_started'
  await sb.from('ess_onboarding_states').insert({
    company_id: companyId,
    employee_id: employeeId,
    status,
    blocked_reason: blocked ? 'Awaiting background check' : null,
    completed_at: allDone ? new Date().toISOString() : null,
  })
}

// Set reports_to on an employee (approver-manager relationship wiring).
async function setReportsTo(employeeId: string, managerEmployeeId: string | null) {
  await sb.from('ess_employees').update({ reports_to: managerEmployeeId }).eq('id', employeeId)
}

// Mark an employee as an approver (is_approver + approval flags).
async function setApprover(employeeId: string, isApprover: boolean) {
  await sb
    .from('ess_employees')
    .update({
      is_approver: isApprover,
      leave_approval_enabled: isApprover ? 1 : 0,
      expense_approval_enabled: isApprover ? 1 : 0,
    })
    .eq('id', employeeId)
}

// Seed expense categories for the tenant (test-data gap fix — Part A item 3).
async function seedExpenseCategories(companyId: string): Promise<string[]> {
  // ess_expense_categories.code is NOT NULL on the live schema.
  const cats = [
    { name: 'Travel', code: 'TRV' },
    { name: 'Meals', code: 'MEAL' },
    { name: 'Accommodation', code: 'ACCM' },
    { name: 'Office Supplies', code: 'OFFC' },
  ]
  const ids: string[] = []
  for (const { name, code } of cats) {
    const { data: existing } = await sb
      .from('ess_expense_categories')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', name)
      .maybeSingle()
    if (existing) { ids.push(existing.id); continue }
    const { data, error } = await sb
      .from('ess_expense_categories')
      .insert({ company_id: companyId, name, code })
      .select('id')
      .single()
    if (error) throw new Error(`expense_category ${name}: ${error.message}`)
    ids.push(data.id)
  }
  return ids
}

// --- 5-role fixture set for the Playwright RBAC matrix -----------------------
// Display tiers collapse hr+manager into "Staff", but the API gating layer
// (55 routes minRole:'hr') treats hr and manager DIFFERENTLY, so the matrix
// needs all five underlying roles. Plus two managers — one approver (direct
// reports + is_approver), one non-approver — to exercise reports_to/is_approver
// relationship gating (timesheets, leave, expense, appraisals).
const RBAC_ROLES: Record<string, { role: string; superAdmin: boolean }> = {
  super_admin: { role: 'admin', superAdmin: true },
  admin: { role: 'admin', superAdmin: false },
  hr: { role: 'hr', superAdmin: false },
  manager: { role: 'manager', superAdmin: false },
  volunteer: { role: 'employee', superAdmin: false },
}

async function seedRbacRoleSet(companyId: string) {
  const set: Record<string, any> = {}
  for (const [key, cfg] of Object.entries(RBAC_ROLES)) {
    const email = `rbac.${key}@acme.test`
    const authId = await ensureAuthUser(email)
    const { employeeId, appUserId } = await upsertAppUserAndEmployee({
      companyId, authUserId: authId, email, fullName: `RBAC ${key}`,
      role: cfg.role, superAdmin: cfg.superAdmin,
      department: key === 'hr' ? 'Human Resources' : 'Volunteers',
      empNo: `RB-${key.slice(0, 4).toUpperCase()}`,
    })
    await seedOnboarding(companyId, employeeId, key === 'volunteer' ? 1 : 4)
    set[key] = { email, password: PASSWORD, role: cfg.role, is_super_admin: cfg.superAdmin, employeeId, appUserId }
    console.log(`  seeded rbac.${key} (role=${cfg.role}, super=${cfg.superAdmin})`)
  }

  // Approver manager: is_approver=true, owns a direct report.
  const apprAuth = await ensureAuthUser('rbac.manager.approver@acme.test')
  const appr = await upsertAppUserAndEmployee({
    companyId, authUserId: apprAuth, email: 'rbac.manager.approver@acme.test', fullName: 'RBAC Manager Approver',
    role: 'manager', superAdmin: false, department: 'Operations', empNo: 'RB-MGRAP',
  })
  await setApprover(appr.employeeId, true)
  await seedOnboarding(companyId, appr.employeeId, 4)

  // Non-approver manager: role=manager but is_approver=false, no reports.
  const nonAuth = await ensureAuthUser('rbac.manager.nonapprover@acme.test')
  const non = await upsertAppUserAndEmployee({
    companyId, authUserId: nonAuth, email: 'rbac.manager.nonapprover@acme.test', fullName: 'RBAC Manager NonApprover',
    role: 'manager', superAdmin: false, department: 'Operations', empNo: 'RB-MGRNA',
  })
  await setApprover(non.employeeId, false)
  await setReportsTo(non.employeeId, null)
  await seedOnboarding(companyId, non.employeeId, 4)

  // A direct report under the approver manager (reports_to-scoped views).
  const repAuth = await ensureAuthUser('rbac.report@acme.test')
  const rep = await upsertAppUserAndEmployee({
    companyId, authUserId: repAuth, email: 'rbac.report@acme.test', fullName: 'RBAC Direct Report',
    role: 'employee', superAdmin: false, department: 'Operations', empNo: 'RB-REP',
  })
  await setReportsTo(rep.employeeId, appr.employeeId)
  await seedOnboarding(companyId, rep.employeeId, 1)

  set.manager_approver = { email: 'rbac.manager.approver@acme.test', password: PASSWORD, role: 'manager', is_super_admin: false, employeeId: appr.employeeId, appUserId: appr.appUserId, isApprover: true }
  set.manager_nonapprover = { email: 'rbac.manager.nonapprover@acme.test', password: PASSWORD, role: 'manager', is_super_admin: false, employeeId: non.employeeId, appUserId: non.appUserId, isApprover: false }
  set.direct_report = { email: 'rbac.report@acme.test', password: PASSWORD, role: 'employee', is_super_admin: false, employeeId: rep.employeeId, appUserId: rep.appUserId, reportsTo: appr.employeeId }
  console.log('  seeded approver/non-approver managers + a direct report')
  return set
}

async function main() {
  const scale = process.argv.includes('--scale')
  const companyId = await getAcmeCompanyId()
  console.log('Acme company:', companyId)

  const fixtures: Record<string, any> = { company_id: companyId, password: PASSWORD, agents: {} }

  // 5-role RBAC fixture set (Playwright matrix) + expense categories.
  fixtures.roles = await seedRbacRoleSet(companyId)
  fixtures.expenseCategories = await seedExpenseCategories(companyId)
  console.log(`  seeded ${fixtures.expenseCategories.length} expense categories`)

  // --- Auth-edge fixtures (Section A) ---------------------------------------
  // Unregistered: a real Supabase auth user with NO ess_app_users row -> login
  // should 403 ("not registered for ESS"). Inactive: app_user is_active=false.
  const unregAuth = await ensureAuthUser('e2e.unregistered@acme.test')
  fixtures.unregistered = { email: 'e2e.unregistered@acme.test', password: PASSWORD, authUserId: unregAuth }
  // ensure no app_user exists for it
  await sb.from('ess_app_users').delete().eq('auth_user_id', unregAuth)

  const inactiveAuth = await ensureAuthUser('e2e.inactive@acme.test')
  const inactive = await upsertAppUserAndEmployee({
    companyId, authUserId: inactiveAuth, email: 'e2e.inactive@acme.test', fullName: 'E2E Inactive',
    role: 'employee', superAdmin: false, department: 'Volunteers', empNo: 'E2E-INACT',
  })
  await sb.from('ess_app_users').update({ is_active: false }).eq('id', inactive.appUserId)
  fixtures.inactive = { email: 'e2e.inactive@acme.test', password: PASSWORD, appUserId: inactive.appUserId, employeeId: inactive.employeeId }
  console.log('  seeded auth-edge users (unregistered, inactive)')

  // --- Tenant-B fixtures (cross-tenant isolation probes, Section D) ----------
  // A separate seeded tenant so isolation tests have a real foreign tenant whose
  // record ids we can probe and expect 404. NEVER touches real tenants.
  const tenantB = await ensureSeedTenant('e2e-tenant-b', 'E2E Tenant B')
  const tbAdminAuth = await ensureAuthUser('e2e.tenantb.admin@acme.test')
  const tbAdmin = await upsertAppUserAndEmployee({
    companyId: tenantB, authUserId: tbAdminAuth, email: 'e2e.tenantb.admin@acme.test', fullName: 'TenantB Admin',
    role: 'admin', superAdmin: false, department: 'Admin', empNo: 'TB-ADMIN',
  })
  // A leave application + expense claim + document owned by tenant B, to probe by id.
  const tbLeave = await seedTenantBArtifacts(tenantB, tbAdmin.employeeId)
  fixtures.tenantB = {
    companyId: tenantB,
    admin: { email: 'e2e.tenantb.admin@acme.test', password: PASSWORD, employeeId: tbAdmin.employeeId, appUserId: tbAdmin.appUserId },
    artifacts: tbLeave,
  }
  console.log('  seeded tenant-B (foreign tenant for isolation probes)')

  // Per-agent role users (legacy .mjs suites)
  for (const agent of ['agentA', 'agentB', 'agentC'] as const) {
    fixtures.agents[agent] = {}
    for (const tier of Object.keys(TIER_ROLE) as Tier[]) {
      const email = `${agent.toLowerCase()}.${tier}@acme.test`
      const fullName = `${agent} ${tier.replace('_', ' ')}`
      const authId = await ensureAuthUser(email)
      const { employeeId, appUserId } = await upsertAppUserAndEmployee({
        companyId, authUserId: authId, email, fullName,
        role: TIER_ROLE[tier].role, superAdmin: TIER_ROLE[tier].superAdmin,
        department: tier === 'staff' ? 'Human Resources' : 'Volunteers',
        empNo: `${agent.slice(-1)}${tier.slice(0, 3).toUpperCase()}`,
      })
      // give the role users a basic onboarding row
      await seedOnboarding(companyId, employeeId, tier === 'volunteer' ? 1 : 4)
      fixtures.agents[agent][tier] = { email, password: PASSWORD, role: TIER_ROLE[tier].role, is_super_admin: TIER_ROLE[tier].superAdmin, employeeId, appUserId }
      console.log(`  seeded ${email} (${tier})`)
    }
  }

  // ~10 sample volunteer profiles in varied onboarding states (shared, read-only-ish for dashboards)
  const states = [0, 0, 1, 2, 3, 4, 4, 1, 2, 3] // doneCount per volunteer
  fixtures.sampleVolunteers = []
  for (let i = 0; i < states.length; i++) {
    const email = `sample.vol${i + 1}@acme.test`
    const authId = await ensureAuthUser(email)
    const { employeeId } = await upsertAppUserAndEmployee({
      companyId, authUserId: authId, email, fullName: `Sample Volunteer ${i + 1}`,
      role: 'employee', superAdmin: false, department: i % 2 ? 'Outreach' : 'Events', empNo: `SV${i + 1}`,
    })
    await seedOnboarding(companyId, employeeId, states[i], i === 7) // vol8 blocked
    fixtures.sampleVolunteers.push({ email, employeeId, doneCount: states[i] })
  }
  console.log(`  seeded ${states.length} sample volunteers (varied onboarding)`)

  if (scale) {
    console.log('Scale seed: creating 250 volunteer employee rows (no auth users — dashboard list only)...')
    // For scale we only need employee rows the dashboard lists; skip auth users for speed.
    const batch: any[] = []
    for (let i = 1; i <= 250; i++) {
      batch.push({
        company_id: companyId,
        full_name: `Scale Volunteer ${String(i).padStart(3, '0')}`,
        email: `scale.vol${i}@acme.test`,
        employee_no: `SCALE${String(i).padStart(3, '0')}`,
        department: ['Outreach', 'Events', 'Fundraising', 'Admin'][i % 4],
      })
    }
    // delete prior scale rows for idempotency
    await sb.from('ess_employees').delete().like('employee_no', 'SCALE%')
    // insert in chunks of 50
    for (let i = 0; i < batch.length; i += 50) {
      const chunk = batch.slice(i, i + 50)
      const { error } = await sb.from('ess_employees').insert(chunk)
      if (error) throw new Error(`scale insert: ${error.message}`)
    }
    fixtures.scaleSeeded = 250
    console.log('  seeded 250 scale volunteers')
  }

  mkdirSync(resolve(process.cwd(), 'tests/fixtures'), { recursive: true })
  writeFileSync(resolve(process.cwd(), 'tests/fixtures/users.json'), JSON.stringify(fixtures, null, 2))
  console.log('\nWrote tests/fixtures/users.json')
  console.log('Done.')
}

main().catch((e) => { console.error('SEED FAILED:', e); process.exit(1) })
