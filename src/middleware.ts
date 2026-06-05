import { NextRequest, NextResponse } from 'next/server'

/**
 * TEMPORARY tourniquet — PRESENCE-ONLY, not token validation.
 *
 * Returns 401 for requests to the known unauthenticated-exposure routes that
 * arrive WITHOUT a `Bearer` Authorization header. This closes the
 * UNAUTHENTICATED hole (including the unauth writes) on the confirmed IDOR/leak
 * routes plus the fails-open leave-applications GET, ahead of the structural
 * withAuth + tenant-scoping fix.
 *
 * IMPORTANT LIMITS:
 *  - It does NOT verify the token. Any non-empty "Bearer x" passes the gate.
 *  - It does NOT enforce tenant scoping. A valid tenant-A token can still reach
 *    tenant-B data until the real per-route fix lands.
 *  - Remove these matcher entries as each route is migrated to withAuth.
 *
 * Location: src/middleware.ts (NOT repo root) because this project uses a src/
 * directory — Next.js only picks up middleware at src/middleware.ts here.
 */
export function middleware(_req: NextRequest) {
  const auth = _req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/employee/by-user/:path*',
    '/api/expense-claims/:path*',
    '/api/preview-approval-chain',
    '/api/leave-applications',
  ],
}
