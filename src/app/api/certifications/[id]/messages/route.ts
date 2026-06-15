// /api/certifications/:id/messages — the per-certification review thread.
//   GET  -> the full conversation (oldest first). Visible to the cert OWNER and
//           to reviewers (hr+). Cross-tenant / non-owner non-reviewer -> 404.
//   POST -> append a message { body }.
//           • owner reply: if the cert was awaiting the volunteer
//             (rejected / changes_requested), it returns to 'submitted' so it
//             re-enters the reviewers' queue. The owner isn't notified (they
//             wrote it); reviewers pick it up from the register.
//           • reviewer note: the cert owner is notified in their inbox.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import { recordAudit } from '@/lib/audit'
import { certMessageCreateSchema } from '@/types/compliance'
import {
  loadCert,
  loadCertThread,
  addCertMessage,
  isOwner,
  isReviewer,
  notifyOwnerOfMessage,
} from '@/lib/compliance/review'

async function ensureModule(companyId: string): Promise<NextResponse | null> {
  try {
    await assertModuleEnabled(companyId, 'compliance')
    return null
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 })
    }
    throw err
  }
}

export const GET = withAuth(async (_request: NextRequest, ctx: AuthContext, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

  const moduleErr = await ensureModule(ctx.companyId)
  if (moduleErr) return moduleErr

  const cert = await loadCert(ctx.companyId, id)
  // Owner or reviewer only; everyone else gets a clean 404 (no existence leak).
  if (!cert || (!isOwner(cert, ctx.employee?.id) && !isReviewer(ctx.role))) {
    return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
  }

  return NextResponse.json({ messages: await loadCertThread(cert.id) })
})

export const POST = withAuth(async (request: NextRequest, ctx: AuthContext, params) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 })

  const moduleErr = await ensureModule(ctx.companyId)
  if (moduleErr) return moduleErr

  const cert = await loadCert(ctx.companyId, id)
  if (!cert) return NextResponse.json({ error: 'Certification not found' }, { status: 404 })

  const owner = isOwner(cert, ctx.employee?.id)
  const reviewer = isReviewer(ctx.role)
  if (!owner && !reviewer) {
    return NextResponse.json({ error: 'Certification not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const parsed = certMessageCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  // The owner's voice wins on their own cert (a staff member commenting on their
  // OWN submission is an owner, not a reviewer).
  const authorKind: 'owner' | 'reviewer' = owner ? 'owner' : 'reviewer'

  await addCertMessage({
    companyId: ctx.companyId,
    certificationId: cert.id,
    authorAppUserId: ctx.appUser.id,
    authorKind,
    body: parsed.data.body,
  })

  if (authorKind === 'owner') {
    // An owner reply re-opens a cert that was waiting on them.
    if (cert.verification_status === 'changes_requested' || cert.verification_status === 'rejected') {
      await supabaseAdmin
        .from('ess_certifications')
        .update({ verification_status: 'submitted', updated_at: new Date().toISOString() })
        .eq('id', cert.id)
        .eq('company_id', ctx.companyId)
    }
  } else {
    // Reviewer note -> tell the owner in their inbox.
    await notifyOwnerOfMessage({
      companyId: ctx.companyId,
      employeeId: cert.employee_id,
      reviewerAppUserId: ctx.appUser.id,
      certTitle: cert.title,
      message: parsed.data.body,
    })
  }

  await recordAudit({
    companyId: ctx.companyId,
    actorId: ctx.appUser.id,
    action: 'certification.message',
    target: { type: 'certification', id: cert.id },
    meta: { authorKind },
  })

  return NextResponse.json({ messages: await loadCertThread(cert.id) }, { status: 201 })
})
