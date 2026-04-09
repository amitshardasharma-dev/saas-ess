// src/app/api/projects/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, { companyId }) => {
  const { data: projects, error } = await supabaseAdmin
    .from('ess_projects')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error

  return NextResponse.json({ projects: projects || [] })
})

export const POST = withAuth(async (request, { companyId }) => {
  const body = await request.json()

  const { data, error } = await supabaseAdmin
    .from('ess_projects')
    .insert({
      company_id: companyId,
      name: body.name,
      code: body.code,
      is_active: body.is_active ?? true,
      billable: body.billable ?? false,
    })
    .select()
    .single()

  if (error) throw error

  return NextResponse.json({ project: data, message: 'Project created' })
}, { minRole: 'hr' })
