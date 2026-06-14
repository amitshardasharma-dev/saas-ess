// /api/profile — the signed-in volunteer's OWN profile (self-scoped).
//   GET   -> editable fields + read-only org info + completion status
//   PATCH -> update own allowed fields, then reconcile the onboarding profile step
// Self-scoped via withAuth's resolved employee, so a volunteer can only ever read
// or edit their own record (no id in the path = no IDOR surface).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import {
  EDITABLE_PROFILE_FIELDS,
  isProfileComplete,
  missingProfileFields,
  syncProfileOnboardingStep,
} from '@/lib/profile-completion'

const SELECT =
  'id, full_name, email, phone, address, date_of_birth, gender, department, designation, employee_no, ' +
  'emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, photo_url'

export const GET = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  if (!ctx.employee) return NextResponse.json({ error: 'No employee record' }, { status: 404 })
  const { data, error } = await supabaseAdmin
    .from('ess_employees')
    .select(SELECT)
    .eq('id', ctx.employee.id)
    .eq('company_id', ctx.companyId)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  return NextResponse.json({
    profile: data,
    complete: isProfileComplete(data as unknown as Record<string, unknown>),
    missing: missingProfileFields(data as unknown as Record<string, unknown>),
  })
})

export const PATCH = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  if (!ctx.employee) return NextResponse.json({ error: 'No employee record' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Whitelist editable fields; trim strings, treat '' as null (clears the field).
  const updates: Record<string, unknown> = {}
  for (const key of EDITABLE_PROFILE_FIELDS) {
    if (body[key] === undefined) continue
    const raw = body[key]
    updates[key] = typeof raw === 'string' ? (raw.trim() === '' ? null : raw.trim()) : raw
  }
  // full_name must never be blanked (NOT NULL column).
  if ('full_name' in updates && !updates.full_name) delete updates.full_name
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('ess_employees')
    .update(updates)
    .eq('id', ctx.employee.id)
    .eq('company_id', ctx.companyId)
    .select(SELECT)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })

  // Data-driven onboarding: mark the profile step done iff mandatory fields are now filled.
  try {
    await syncProfileOnboardingStep(ctx.employee.id)
  } catch (e) {
    console.error('[profile] onboarding sync failed (non-fatal):', (e as Error)?.message)
  }

  return NextResponse.json({
    profile: data,
    complete: isProfileComplete(data as unknown as Record<string, unknown>),
    missing: missingProfileFields(data as unknown as Record<string, unknown>),
  })
})
