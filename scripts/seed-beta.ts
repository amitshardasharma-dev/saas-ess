import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function seedBeta() {
  const BETA_ID = 'b8e3d60b-cfe3-4df6-b3ea-fec1cd26a76e'

  // Create auth user
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  let authUserId: string
  const existing = existingUsers?.users?.find(u => u.email === 'admin@beta.com')
  
  if (existing) {
    authUserId = existing.id
    console.log('Auth user exists:', authUserId)
  } else {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email: 'admin@beta.com', password: 'Test1234!', email_confirm: true
    })
    if (error) { console.error('Auth error:', error.message); return }
    authUserId = newUser.user!.id
    console.log('Created auth user:', authUserId)
  }

  // App user
  const { data: appUser } = await supabase.from('ess_app_users')
    .upsert({ auth_user_id: authUserId, company_id: BETA_ID, role: 'admin', is_active: true }, { onConflict: 'auth_user_id' })
    .select().single()
  console.log('App user:', appUser?.id)

  // Employee
  const { data: emp } = await supabase.from('ess_employees')
    .upsert({
      app_user_id: appUser!.id, company_id: BETA_ID, email: 'admin@beta.com',
      full_name: 'Beta Admin', employee_no: 'BETA001', department: 'Management',
      designation: 'Director', is_approver: true, leave_approval_enabled: 1, expense_approval_enabled: 1
    }, { onConflict: 'app_user_id' })
    .select().single()
  console.log('Employee:', emp?.id)

  // Create leave types for Beta Inc
  await supabase.from('ess_leave_types').upsert([
    { company_id: BETA_ID, name: 'Annual Leave', code: 'AL', eligible_days: 15 },
    { company_id: BETA_ID, name: 'Sick Leave', code: 'SL', eligible_days: 8 },
  ], { onConflict: 'company_id,code' })
  console.log('Leave types created for Beta')

  // Create a timesheet for Acme employee (to test isolation)
  console.log('\nBeta Inc setup complete!')
  console.log('Login: admin@beta.com / Test1234!')
}

seedBeta().catch(console.error)
