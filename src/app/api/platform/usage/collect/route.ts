// src/app/api/platform/usage/collect/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const POST = withSuperAdmin(async () => {
  // Get all active companies
  const { data: companies, error: companiesError } = await supabaseAdmin
    .from('ess_companies')
    .select('id, name')
    .eq('status', 'active')

  if (companiesError) throw companiesError

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const measuredAt = now.toISOString()

  const rows = []
  const errors: string[] = []

  for (const company of companies || []) {
    try {
      const companyId = company.id

      // Count active users
      const { count: userCount } = await supabaseAdmin
        .from('ess_app_users')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true)

      // Count active employees
      const { count: empCount } = await supabaseAdmin
        .from('ess_employees')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'Active')

      // Count timesheets submitted this month
      const { count: timesheetCount } = await supabaseAdmin
        .from('ess_timesheets')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', monthStart)

      // Count leave applications this month
      const { count: leaveCount } = await supabaseAdmin
        .from('ess_leave_applications')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', monthStart)

      // Count documents
      const { count: docCount } = await supabaseAdmin
        .from('ess_documents')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)

      rows.push({
        company_id: companyId,
        measured_at: measuredAt,
        user_count: userCount ?? 0,
        storage_used_mb: 0, // storage tracking not implemented yet
        active_employees: empCount ?? 0,
        timesheets_this_month: timesheetCount ?? 0,
        leave_apps_this_month: leaveCount ?? 0,
        documents_count: docCount ?? 0,
      })
    } catch (err: any) {
      errors.push(`${company.name}: ${err.message}`)
    }
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('ess_tenant_usage')
      .insert(rows)

    if (insertError) throw insertError
  }

  return NextResponse.json({
    message: `Usage collected for ${rows.length} tenant(s)`,
    collected: rows.length,
    errors: errors.length > 0 ? errors : undefined,
  })
})
