// POST /api/documents/[id]/signing/restart  (hr+, MOS-720)
// Restart one person's copy: cancels its in-progress signing so it starts again
// from step 1. Existing signatures on that copy stop counting (kept on record).
// Body: { versionId, recipientEmployeeId, confirm: true }.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth-middleware'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { getVersionForCompany } from '@/services/esign'
import { cancelInProgress } from '@/services/signing-sequence'

const Body = z.object({ versionId: z.string().uuid(), recipientEmployeeId: z.string().uuid(), confirm: z.literal(true) }).strict()

export const POST = withAuth(
  async (request, { companyId, appUser }, params) => {
    const documentId = params?.id
    if (!documentId) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    try {
      await assertModuleEnabled(companyId, 'documents_esign')
    } catch (err) {
      if (err instanceof ModuleDisabledError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      throw err
    }
    const parsed = Body.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Restarting invalidates existing signatures on this copy; confirm to continue' }, { status: 400 })
    }
    const ctx = await getVersionForCompany(companyId, parsed.data.versionId)
    if (!ctx || ctx.documentId !== documentId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const cancelled = await cancelInProgress(companyId, ctx.versionId, appUser.id, 'Restarted by admin', parsed.data.recipientEmployeeId)
    return NextResponse.json({ cancelled })
  },
  { minRole: 'hr' },
)
