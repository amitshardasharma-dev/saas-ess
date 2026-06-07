import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { updatePerson } from '@/lib/people-admin';
import { recordAudit } from '@/lib/audit';

// PATCH /api/people/[id] → { person } — manage a user profile (Admin).
// [id] is the employee UUID. Edits name/department/role/active for a person in
// the caller's company; a foreign-tenant id resolves to 404 (no existence leak).
// Admins cannot change their own role or deactivate themselves (anti-lockout).
export const PATCH = withAuth(
  async (request: NextRequest, { companyId, appUser }, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const result = await updatePerson(id, companyId, body, appUser.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'people.updated',
      target: { type: 'employee', id },
      meta: { role: result.person.role, isActive: result.person.isActive },
    });

    return NextResponse.json({ person: result.person });
  },
  { minRole: 'admin' }
);
