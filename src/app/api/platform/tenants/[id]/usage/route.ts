// src/app/api/platform/tenants/[id]/usage/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withSuperAdmin } from '@/lib/super-admin-middleware'

export const GET = withSuperAdmin(async (_request, _ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const { data: usage, error } = await supabaseAdmin
    .from('ess_tenant_usage')
    .select('*')
    .eq('company_id', id)
    .order('measured_at', { ascending: false })
    .limit(30)

  if (error) throw error

  return NextResponse.json({ usage: usage || [] })
})
