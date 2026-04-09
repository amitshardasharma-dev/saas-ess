// src/app/api/timesheets/[id]/entries/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: entries, error } = await supabaseAdmin
    .from('ess_timesheet_entries')
    .select(`
      *,
      ess_projects (name, code)
    `)
    .eq('timesheet_id', id)
    .order('entry_date')

  if (error) throw error

  return NextResponse.json({
    entries: (entries || []).map((e: any) => ({
      ...e,
      project_name: e.ess_projects?.name || null,
    })),
  })
})
