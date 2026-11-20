// POST /api/people/volunteer-types — give one volunteer type to many people at
// once, or take it away (admin). Body: { employee_ids: uuid[], type_id, action }
// The changed people's checklists are re-synced.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { bulkSetVolunteerType } from '@/lib/volunteer-types'

const schema = z
  .object({
    employee_ids: z.array(z.string().uuid()).min(1).max(500),
    type_id: z.string().uuid(),
    action: z.enum(['add', 'remove']),
  })
  .strict()

export const POST = withAuth(
  async (req: NextRequest, { companyId, appUser }) => {
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    const { employee_ids: employeeIds, type_id: typeId, action } = parsed.data

    const res = await bulkSetVolunteerType(companyId, employeeIds, typeId, action, appUser.id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'people.volunteer_types_bulk',
      target: { type: 'volunteer_type', id: typeId },
      meta: { action, people: employeeIds.length, changed: res.changed, sync: res.sync },
    })
    return NextResponse.json({ changed: res.changed, sync: res.sync })
  },
  { minRole: 'admin' },
)
