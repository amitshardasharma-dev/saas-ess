// src/app/api/platform/tenants/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url)
  const search = url.searchParams.get('search') || ''
  const plan = url.searchParams.get('plan') || ''
  const status = url.searchParams.get('status') || ''

  let query = supabaseAdmin
    .from('ess_companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`)
  }
  if (plan) {
    query = query.eq('plan', plan)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data: companies, error } = await query
  if (error) throw error

  // Get user counts per company
  const { data: userCounts } = await supabaseAdmin
    .from('ess_app_users')
    .select('company_id')
    .eq('is_active', true)

  const usersPerCompany: Record<string, number> = {}
  for (const u of userCounts || []) {
    usersPerCompany[u.company_id] = (usersPerCompany[u.company_id] || 0) + 1
  }

  // Get employee counts per company
  const { data: empCounts } = await supabaseAdmin
    .from('ess_employees')
    .select('company_id')
    .eq('status', 'Active')

  const empsPerCompany: Record<string, number> = {}
  for (const e of empCounts || []) {
    empsPerCompany[e.company_id] = (empsPerCompany[e.company_id] || 0) + 1
  }

  const tenants = (companies || []).map(c => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    plan: c.plan,
    status: c.status,
    max_users: c.max_users,
    max_storage_mb: c.max_storage_mb,
    user_count: usersPerCompany[c.id] || 0,
    employee_count: empsPerCompany[c.id] || 0,
    created_at: c.created_at,
    settings: c.settings || {},
  }))

  return NextResponse.json({ tenants })
})

export const POST = withSuperAdmin(async (request) => {
  const body = await request.json()
  const {
    company_name, company_slug, admin_email, admin_password,
    admin_name, plan_slug, modules_enabled,
  } = body

  if (!company_name || !company_slug || !admin_email || !admin_password || !admin_name) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  // Check slug is unique
  const { data: existing } = await supabaseAdmin
    .from('ess_companies')
    .select('id')
    .eq('slug', company_slug)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Company slug already exists' }, { status: 409 })
  }

  // Get plan details
  const { data: plan } = await supabaseAdmin
    .from('ess_platform_plans')
    .select('*')
    .eq('slug', plan_slug || 'free')
    .single()

  // 1. Create company
  const { data: company, error: companyError } = await supabaseAdmin
    .from('ess_companies')
    .insert({
      name: company_name,
      slug: company_slug,
      plan: plan_slug || 'free',
      status: 'active',
      max_users: plan?.max_users || 10,
      max_storage_mb: plan?.max_storage_mb || 500,
      settings: {
        modules_enabled: modules_enabled || plan?.modules_allowed || ['leave', 'expense'],
      },
    })
    .select()
    .single()

  if (companyError) {
    return NextResponse.json({ error: `Failed to create company: ${companyError.message}` }, { status: 500 })
  }

  // 2. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: admin_email,
    password: admin_password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    // Rollback company
    await supabaseAdmin.from('ess_companies').delete().eq('id', company.id)
    return NextResponse.json({ error: `Failed to create auth user: ${authError?.message}` }, { status: 500 })
  }

  // 3. Create app user
  const { data: appUser, error: appUserError } = await supabaseAdmin
    .from('ess_app_users')
    .insert({
      auth_user_id: authData.user.id,
      company_id: company.id,
      role: 'admin',
      is_active: true,
    })
    .select()
    .single()

  if (appUserError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    await supabaseAdmin.from('ess_companies').delete().eq('id', company.id)
    return NextResponse.json({ error: `Failed to create app user: ${appUserError.message}` }, { status: 500 })
  }

  // 4. Create employee record
  const { error: empError } = await supabaseAdmin
    .from('ess_employees')
    .insert({
      app_user_id: appUser.id,
      company_id: company.id,
      email: admin_email,
      full_name: admin_name,
      employee_no: `${company_slug.toUpperCase().slice(0, 4)}001`,
      department: 'Management',
      designation: 'Administrator',
      status: 'Active',
      is_approver: true,
      leave_approval_enabled: 1,
      expense_approval_enabled: 1,
    })

  if (empError) {
    console.error('Employee creation error:', empError)
    // Non-fatal — company and user still created
  }

  // 5. Create default leave types
  const defaultLeaveTypes = [
    { company_id: company.id, name: 'Annual Leave', code: 'AL', eligible_days: 20 },
    { company_id: company.id, name: 'Sick Leave', code: 'SL', eligible_days: 10 },
    { company_id: company.id, name: 'Personal Leave', code: 'PL', eligible_days: 5 },
  ]
  await supabaseAdmin.from('ess_leave_types').insert(defaultLeaveTypes)

  // 6. Create default approval rules
  const defaultRules = [
    { company_id: company.id, rule_type: 'leave', level_no: 1, approver_type: 'reporting_manager', is_active: true },
    { company_id: company.id, rule_type: 'expense', level_no: 1, approver_type: 'reporting_manager', is_active: true },
    { company_id: company.id, rule_type: 'timesheet', level_no: 1, approver_type: 'reporting_manager', is_active: true },
  ]
  await supabaseAdmin.from('ess_approval_rules').insert(defaultRules)

  return NextResponse.json({
    message: 'Tenant created successfully',
    tenant: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      plan: company.plan,
      admin_email,
    },
  })
})
