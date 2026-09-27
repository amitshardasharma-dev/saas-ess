// GET /api/signing/queue  (MOS-720)
// Copies waiting for the caller as a named signer (e.g. Authorised Officer),
// including sign-once sheets. A recipient's own documents are listed by
// /api/documents as before.
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-middleware'
import { listMySigningQueue } from '@/services/signing-sequence'

export const GET = withAuth(async (_request, { companyId, employee }) => {
  if (!employee) return NextResponse.json({ items: [] })
  try {
    const items = await listMySigningQueue(companyId, employee.id)
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[signing] queue failed:', (err as Error)?.message)
    return NextResponse.json({ items: [] })
  }
})
