// scripts/seed-test-data.ts
// Run with: npx tsx scripts/seed-test-data.ts

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

async function seed() {
  console.log('Starting seed...')

  // 1. Companies
  console.log('Creating companies...')
  const { data: companyA, error: companyAError } = await supabase
    .from('ess_companies')
    .upsert(
      {
        name: 'Acme Corp',
        slug: 'acme-corp',
        settings: {
          modules_enabled: [
            'leave',
            'expense',
            'timesheets',
            'documents',
            'appraisals',
            'contracts',
            'team_calendar',
          ],
        },
      },
      { onConflict: 'slug' }
    )
    .select()
    .single()

  const { data: companyB, error: companyBError } = await supabase
    .from('ess_companies')
    .upsert(
      {
        name: 'Beta Inc',
        slug: 'beta-inc',
        settings: { modules_enabled: ['leave', 'expense'] },
      },
      { onConflict: 'slug' }
    )
    .select()
    .single()

  if (companyAError) console.error('  Company A error:', companyAError.message)
  if (companyBError) console.error('  Company B error:', companyBError.message)

  if (!companyA || !companyB) {
    console.error('Failed to create companies — aborting')
    return
  }
  console.log(`  Company A: ${companyA.id} (${companyA.name})`)
  console.log(`  Company B: ${companyB.id} (${companyB.name})`)

  // 2. Create auth users + app users + employees for Company A
  console.log('Creating users and employees for Company A...')
  const users = [
    { email: 'admin@acme.com', role: 'admin', name: 'Alice Admin', empNo: 'ACME001', dept: 'Management', designation: 'Director' },
    { email: 'hr@acme.com', role: 'hr', name: 'Hannah HR', empNo: 'ACME002', dept: 'Human Resources', designation: 'HR Manager' },
    { email: 'manager@acme.com', role: 'manager', name: 'Mike Manager', empNo: 'ACME003', dept: 'Engineering', designation: 'Engineering Manager' },
    { email: 'employee1@acme.com', role: 'employee', name: 'Eve Employee', empNo: 'ACME004', dept: 'Engineering', designation: 'Software Engineer' },
    { email: 'employee2@acme.com', role: 'employee', name: 'Frank Employee', empNo: 'ACME005', dept: 'Engineering', designation: 'Software Engineer' },
  ]

  const employeeIds: Record<string, string> = {}

  // Fetch all existing auth users once to avoid repeated admin API calls
  const { data: existingUsersData } = await supabase.auth.admin.listUsers()
  const existingAuthUsers = existingUsersData?.users ?? []

  for (const u of users) {
    console.log(`  Processing user: ${u.email}`)

    // Create auth user (or get existing)
    let authUserId: string
    const existing = existingAuthUsers.find((eu) => eu.email === u.email)

    if (existing) {
      authUserId = existing.id
      console.log(`    Auth user already exists: ${authUserId}`)
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: 'Test1234!',
        email_confirm: true,
      })
      if (createError || !newUser.user) {
        console.error(`    Failed to create auth user: ${createError?.message}`)
        continue
      }
      authUserId = newUser.user.id
      console.log(`    Created auth user: ${authUserId}`)
    }

    // Create app user
    const { data: appUser, error: appUserError } = await supabase
      .from('ess_app_users')
      .upsert(
        { auth_user_id: authUserId, company_id: companyA.id, role: u.role, is_active: true },
        { onConflict: 'auth_user_id' }
      )
      .select()
      .single()

    if (appUserError || !appUser) {
      console.error(`    Failed to create app user: ${appUserError?.message}`)
      continue
    }
    console.log(`    App user: ${appUser.id}`)

    // Determine approver flags based on role
    const isApprover = u.role === 'manager' || u.role === 'admin'
    const approvalFlag = isApprover ? 1 : 0

    // Create employee
    const { data: emp, error: empError } = await supabase
      .from('ess_employees')
      .upsert(
        {
          app_user_id: appUser.id,
          company_id: companyA.id,
          email: u.email,
          full_name: u.name,
          employee_no: u.empNo,
          department: u.dept,
          designation: u.designation,
          is_approver: isApprover,
          leave_approval_enabled: approvalFlag,
          expense_approval_enabled: approvalFlag,
        },
        { onConflict: 'app_user_id' }
      )
      .select()
      .single()

    if (empError || !emp) {
      console.error(`    Failed to create employee: ${empError?.message}`)
      continue
    }
    employeeIds[u.email] = emp.id
    console.log(`    Employee: ${emp.id}`)
  }

  // Set reports_to for employees
  const managerId = employeeIds['manager@acme.com']
  const emp1Id = employeeIds['employee1@acme.com']
  const emp2Id = employeeIds['employee2@acme.com']

  if (managerId && emp1Id) {
    const { error: e1 } = await supabase
      .from('ess_employees')
      .update({ reports_to: managerId })
      .eq('id', emp1Id)
    if (e1) console.error('  Failed to set reports_to for employee1:', e1.message)
    else console.log('  Set employee1 reports_to manager')
  }

  if (managerId && emp2Id) {
    const { error: e2 } = await supabase
      .from('ess_employees')
      .update({ reports_to: managerId })
      .eq('id', emp2Id)
    if (e2) console.error('  Failed to set reports_to for employee2:', e2.message)
    else console.log('  Set employee2 reports_to manager')
  }

  // 3. Leave Types
  console.log('Creating leave types for Company A...')
  const leaveTypes = [
    { company_id: companyA.id, name: 'Annual Leave', code: 'AL', eligible_days: 20 },
    { company_id: companyA.id, name: 'Sick Leave', code: 'SL', eligible_days: 10 },
    { company_id: companyA.id, name: 'Personal Leave', code: 'PL', eligible_days: 5 },
  ]
  for (const lt of leaveTypes) {
    const { error: ltError } = await supabase
      .from('ess_leave_types')
      .upsert(lt, { onConflict: 'company_id,code' })
      .select()
    if (ltError) console.error(`  Failed to upsert leave type ${lt.name}:`, ltError.message)
    else console.log(`  Leave type: ${lt.name} (${lt.eligible_days} days)`)
  }

  // 4. Approval Rules
  console.log('Creating approval rules for Company A...')
  const ruleTypes = ['leave', 'timesheet', 'expense']
  for (const rt of ruleTypes) {
    const { data: existing } = await supabase
      .from('ess_approval_rules')
      .select('id')
      .eq('company_id', companyA.id)
      .eq('rule_type', rt)
      .single()

    if (existing) {
      console.log(`  Approval rule already exists: ${rt}`)
      continue
    }

    const { error: ruleError } = await supabase.from('ess_approval_rules').insert({
      company_id: companyA.id,
      rule_type: rt,
      level_no: 1,
      approver_type: 'reporting_manager',
      is_active: true,
    })
    if (ruleError) console.error(`  Failed to create approval rule ${rt}:`, ruleError.message)
    else console.log(`  Approval rule: ${rt} → level 1 = reporting_manager`)
  }

  // 5. Timesheet Config
  console.log('Creating timesheet config for Company A...')
  const { error: tsError } = await supabase
    .from('ess_timesheet_configs')
    .upsert(
      {
        company_id: companyA.id,
        mode: 'simple_hours',
        submission_cycle: 'weekly',
        week_start_day: 1,
        required_hours_per_day: 8,
        overtime_enabled: false,
        projects_enabled: false,
      },
      { onConflict: 'company_id' }
    )
  if (tsError) console.error('  Failed to upsert timesheet config:', tsError.message)
  else console.log('  Timesheet config: simple_hours, weekly, 8h/day')

  // 6. Document Categories
  console.log('Creating document categories for Company A...')
  const categories = ['Company Policies', 'HR Forms', 'Employee Handbook']
  for (let i = 0; i < categories.length; i++) {
    const { data: existing } = await supabase
      .from('ess_document_categories')
      .select('id')
      .eq('company_id', companyA.id)
      .eq('name', categories[i])
      .single()

    if (existing) {
      console.log(`  Document category already exists: ${categories[i]}`)
      continue
    }

    const { error: catError } = await supabase.from('ess_document_categories').insert({
      company_id: companyA.id,
      name: categories[i],
      sort_order: i,
    })
    if (catError) console.error(`  Failed to create category ${categories[i]}:`, catError.message)
    else console.log(`  Document category: ${categories[i]}`)
  }

  // 7. Appraisal Template
  console.log('Creating appraisal template for Company A...')
  const { data: existingTemplate } = await supabase
    .from('ess_appraisal_templates')
    .select('id')
    .eq('company_id', companyA.id)
    .eq('name', 'Standard Review')
    .single()

  if (existingTemplate) {
    console.log('  Appraisal template already exists: Standard Review')
  } else {
    const { error: tplError } = await supabase.from('ess_appraisal_templates').insert({
      company_id: companyA.id,
      name: 'Standard Review',
      description: 'Standard annual performance review template',
      is_default: true,
      sections: [
        {
          id: 'perf',
          name: 'Performance Rating',
          type: 'rating_scale',
          weight: 40,
          rating_min: 1,
          rating_max: 5,
          rating_labels: ['Poor', 'Below Average', 'Average', 'Good', 'Excellent'],
        },
        {
          id: 'strengths',
          name: 'Strengths & Improvements',
          type: 'text',
          weight: 30,
        },
        {
          id: 'goals',
          name: 'Goals Review',
          type: 'goals',
          weight: 30,
        },
      ],
    })
    if (tplError) console.error('  Failed to create appraisal template:', tplError.message)
    else console.log('  Appraisal template: Standard Review (3 sections)')
  }

  // 8. Contract Types
  console.log('Creating contract types for Company A...')
  const contractTypes = [
    { name: 'Permanent', requires_end_date: false, default_duration_months: null },
    { name: 'Fixed-Term', requires_end_date: true, default_duration_months: 12 },
    { name: 'Probation', requires_end_date: true, default_duration_months: 3 },
  ]
  for (const ct of contractTypes) {
    const { data: existing } = await supabase
      .from('ess_contract_types')
      .select('id')
      .eq('company_id', companyA.id)
      .eq('name', ct.name)
      .single()

    if (existing) {
      console.log(`  Contract type already exists: ${ct.name}`)
      continue
    }

    const { error: ctError } = await supabase
      .from('ess_contract_types')
      .insert({ ...ct, company_id: companyA.id })
    if (ctError) console.error(`  Failed to create contract type ${ct.name}:`, ctError.message)
    else console.log(`  Contract type: ${ct.name}`)
  }

  console.log('\nSeed complete!')
  console.log('Test credentials: any email above with password "Test1234!"')
  console.log('')
  console.log('Users created:')
  console.log('  admin@acme.com    — role: admin')
  console.log('  hr@acme.com       — role: hr')
  console.log('  manager@acme.com  — role: manager')
  console.log('  employee1@acme.com — role: employee (reports to manager)')
  console.log('  employee2@acme.com — role: employee (reports to manager)')
}

seed().catch(console.error)
