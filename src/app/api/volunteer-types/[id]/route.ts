// /api/volunteer-types/[id] — rename / reorder / delete one volunteer type (admin).
//   PATCH  -> Body: { name?, description?, sort_order? }
//   DELETE -> removes the type and its flow; people who had it are re-synced
//             (their open steps from this type go, completed steps stay).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { updateVolunteerType, deleteVolunteerType } from '@/lib/volunteer-types'

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
  })
  .strict()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PATCH = withAuth(
  async (req: NextRequest, { companyId, appUser }, params) => {
    const id = params?.id ?? ''
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Volunteer type not found' }, { status: 404 })
    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const res = await updateVolunteerType(companyId, id, parsed.data)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'volunteer_type.updated',
      target: { type: 'volunteer_type', id },
      meta: { ...parsed.data },
    })
    return NextResponse.json({ type: res.type })
  },
  { minRole: 'admin' },
)

export const DELETE = withAuth(
  async (_req: NextRequest, { companyId, appUser }, params) => {
    const id = params?.id ?? ''
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Volunteer type not found' }, { status: 404 })

    const res = await deleteVolunteerType(companyId, id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'volunteer_type.deleted',
      target: { type: 'volunteer_type', id },
      meta: { members: res.members, sync: res.sync },
    })
    return NextResponse.json({ ok: true, members: res.members, sync: res.sync })
  },
  { minRole: 'admin' },
)
