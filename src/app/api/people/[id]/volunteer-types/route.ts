// PUT /api/people/[id]/volunteer-types — set one person's volunteer types (admin).
// Body: { type_ids: uuid[] }. The person's checklist is re-synced: steps for a
// new type are added, open steps that no type needs any more are removed, and
// completed steps always stay.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import { recordAudit } from '@/lib/audit'
import { setPersonVolunteerTypes } from '@/lib/volunteer-types'

const schema = z.object({ type_ids: z.array(z.string().uuid()).max(50) }).strict()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PUT = withAuth(
  async (req: NextRequest, { companyId, appUser }, params) => {
    const id = params?.id ?? ''
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const res = await setPersonVolunteerTypes(companyId, id, parsed.data.type_ids, appUser.id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

    if (res.added.length || res.removed.length) {
      await recordAudit({
        companyId,
        actorId: appUser.id,
        action: 'people.volunteer_types_changed',
        target: { type: 'employee', id },
        meta: { added: res.added, removed: res.removed, sync: res.sync },
      })
    }
    return NextResponse.json({ type_ids: parsed.data.type_ids, added: res.added, removed: res.removed, sync: res.sync })
  },
  { minRole: 'admin' },
)
