// /api/cert-types — manage tenant certification types (Staff/Admin = hr+).
// Module-gated on 'compliance'; identity/tenant derived from withAuth, never body.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { certTypeCreateSchema } from '@/types/compliance'

export const GET = withAuth(async (_request: NextRequest, { companyId }) => {
  try {
    await assertModuleEnabled(companyId, 'compliance')
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw err
  }

  const { data, error } = await supabaseAdmin
    .from('ess_cert_types')
    .select('*')
    .eq('company_id', companyId)
    .order('name')

  if (error) {
    console.error('Cert types fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch cert types' }, { status: 500 })
  }

  return NextResponse.json({ cert_types: data || [] })
})

export const POST = withAuth(
  async (request: NextRequest, { companyId, appUser }) => {
    try {
      await assertModuleEnabled(companyId, 'compliance')
    } catch (err) {
      if (err instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
      }
      throw err
    }

    const body = await request.json().catch(() => null)
    const parsed = certTypeCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('ess_cert_types')
      .insert({
        company_id: companyId,
        name: parsed.data.name,
        validity_months: parsed.data.validity_months ?? null,
        requires_file: parsed.data.requires_file ?? false,
        required: parsed.data.required ?? false,
        // Default mirrors the migration default {90,30,7} when omitted.
        reminder_offsets: parsed.data.reminder_offsets ?? [90, 30, 7],
      })
      .select()
      .single()

    if (error || !data) {
      console.error('Cert type create error:', error)
      return NextResponse.json({ error: 'Failed to create cert type' }, { status: 500 })
    }

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'cert_type.created',
      target: { type: 'cert_type', id: data.id },
    })

    return NextResponse.json({ cert_type: data }, { status: 201 })
  },
  { minRole: 'hr' },
)
