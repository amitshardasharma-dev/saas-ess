// src/app/api/announcements/[id]/dismiss/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'

export const POST = withAuth(async (_request, ctx, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Announcement ID required' }, { status: 400 })

  const { appUser } = ctx

  // Upsert dismissal — safe to call multiple times
  const { error } = await supabaseAdmin
    .from('ess_announcement_dismissals')
    .upsert(
      { announcement_id: id, user_id: appUser.id },
      { onConflict: 'announcement_id,user_id' }
    )

  if (error) throw error

  return NextResponse.json({ message: 'Announcement dismissed' })
})
