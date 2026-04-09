// src/app/api/announcements/active/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const GET = withAuth(async (_request, ctx) => {
  const now = new Date().toISOString()
  const { companyId, appUser } = ctx

  // 1. Fetch all currently active announcements (time window)
  const { data: announcements, error } = await supabaseAdmin
    .from('ess_announcements')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })

  if (error) throw error

  // 2. Get dismissed announcement IDs for this user
  const { data: dismissals } = await supabaseAdmin
    .from('ess_announcement_dismissals')
    .select('announcement_id')
    .eq('user_id', appUser.id)

  const dismissedIds = new Set((dismissals || []).map(d => d.announcement_id))

  // 3. Get company plan for plan-based filtering
  const { data: company } = await supabaseAdmin
    .from('ess_companies')
    .select('plan')
    .eq('id', companyId)
    .single()

  const companyPlan = company?.plan || ''

  // 4. Filter by targeting rules and exclude dismissed
  const visible = (announcements || []).filter(a => {
    // Skip dismissed announcements
    if (dismissedIds.has(a.id)) return false

    // Check targeting
    if (a.target_type === 'all') return true
    if (a.target_type === 'specific_tenants') {
      return (a.target_ids || []).includes(companyId)
    }
    if (a.target_type === 'specific_plans') {
      return (a.target_ids || []).includes(companyPlan)
    }

    return false
  })

  return NextResponse.json({ announcements: visible })
})
