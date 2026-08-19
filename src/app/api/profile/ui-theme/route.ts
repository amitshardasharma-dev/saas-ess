// PUT /api/profile/ui-theme  — save the signed-in user's interface design.
// Self-scoped: always writes to the caller's own account, never an id from the
// body, so one user can't change another's preference.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'

const THEMES = ['classic', 'pro'] as const

export const PUT = withAuth(async (request: NextRequest, { appUser }) => {
  const body = await request.json().catch(() => null)
  const theme = body?.theme
  if (typeof theme !== 'string' || !THEMES.includes(theme as (typeof THEMES)[number])) {
    return NextResponse.json({ error: `theme must be one of ${THEMES.join(', ')}` }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('ess_app_users')
    .update({ ui_theme: theme })
    .eq('id', appUser.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ theme })
})
