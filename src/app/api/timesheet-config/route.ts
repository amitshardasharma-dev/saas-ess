// src/app/api/timesheet-config/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }) => {
  // Check if config exists, return defaults if not
  const { data: config } = await supabaseAdmin
    .from('ess_timesheet_configs')
    .select('*')
    .eq('company_id', companyId)
    .single()

  if (config) {
    return NextResponse.json({ config })
  }

  // Return defaults
  return NextResponse.json({
    config: {
      id: null,
      company_id: companyId,
      mode: 'simple_hours',
      submission_cycle: 'weekly',
      week_start_day: 1, // Monday
      required_hours_per_day: 8,
      overtime_enabled: false,
      projects_enabled: false,
    },
  })
})

export const POST = withAuth(async (request, { companyId }) => {
  const body = await request.json()

  const configData = {
    company_id: companyId,
    mode: body.mode || 'simple_hours',
    submission_cycle: body.submission_cycle || 'weekly',
    week_start_day: body.week_start_day ?? 1,
    required_hours_per_day: body.required_hours_per_day ?? 8,
    overtime_enabled: body.overtime_enabled ?? false,
    projects_enabled: body.projects_enabled ?? false,
  }

  // Upsert — update if exists, insert if not
  const { data: existing } = await supabaseAdmin
    .from('ess_timesheet_configs')
    .select('id')
    .eq('company_id', companyId)
    .single()

  let result
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('ess_timesheet_configs')
      .update(configData)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    result = data
  } else {
    const { data, error } = await supabaseAdmin
      .from('ess_timesheet_configs')
      .insert(configData)
      .select()
      .single()
    if (error) throw error
    result = data
  }

  return NextResponse.json({ config: result, message: 'Timesheet config saved' })
}, { minRole: 'admin' })
