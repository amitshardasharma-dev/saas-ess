// /api/volunteer-types — the company's volunteer types (Op shop, Events, ...).
//   GET  -> { types: [{ id, name, description, sort_order, templateId, memberCount }] }  (manager+)
//   POST -> create a type (admin). Body: { name, description? }
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { listVolunteerTypes, createVolunteerType } from '@/lib/volunteer-types'

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()

export const GET = withAuth(
  async (_req: NextRequest, { companyId }) => {
    return NextResponse.json({ types: await listVolunteerTypes(companyId) })
  },
  { minRole: 'manager' },
)

export const POST = withAuth(
  async (req: NextRequest, { companyId, appUser }) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'A name of 1 to 80 characters is required' }, { status: 400 })

    const res = await createVolunteerType(companyId, parsed.data)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'volunteer_type.created',
      target: { type: 'volunteer_type', id: res.type.id },
      meta: { name: res.type.name },
    })
    return NextResponse.json({ type: res.type }, { status: 201 })
  },
  { minRole: 'admin' },
)
