// src/app/api/platform/dashboard/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async () => {
  // Total tenants
  const { data: companies } = await supabaseAdmin
    .from('ess_companies')
    .select('id, name, plan, status, max_users, created_at')
    .order('created_at', { ascending: false })

  const allCompanies = companies || []

  // Total users
  const { count: totalUsers } = await supabaseAdmin
    .from('ess_app_users')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // Tenants by plan
  const tenantsByPlan: Record<string, number> = {}
  const tenantsByStatus: Record<string, number> = {}
  for (const c of allCompanies) {
    tenantsByPlan[c.plan] = (tenantsByPlan[c.plan] || 0) + 1
    tenantsByStatus[c.status] = (tenantsByStatus[c.status] || 0) + 1
  }

  // User counts per company for over-limit check
  const { data: userCounts } = await supabaseAdmin
    .from('ess_app_users')
    .select('company_id')
    .eq('is_active', true)

  const usersPerCompany: Record<string, number> = {}
  for (const u of userCounts || []) {
    usersPerCompany[u.company_id] = (usersPerCompany[u.company_id] || 0) + 1
  }

  let overLimitTenants = 0
  for (const c of allCompanies) {
    if ((usersPerCompany[c.id] || 0) > c.max_users) {
      overLimitTenants++
    }
  }

  // Recent signups (last 10)
  const recentSignups = allCompanies.slice(0, 10).map(c => ({
    id: c.id,
    name: c.name,
    plan: c.plan,
    created_at: c.created_at,
  }))

  return NextResponse.json({
    total_tenants: allCompanies.length,
    total_users: totalUsers || 0,
    tenants_by_plan: tenantsByPlan,
    tenants_by_status: tenantsByStatus,
    recent_signups: recentSignups,
    over_limit_tenants: overLimitTenants,
  })
})
