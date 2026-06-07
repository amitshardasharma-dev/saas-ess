import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { loadPeople } from '@/app/dashboard/people/people-data';
import { createPerson } from '@/lib/people-admin';
import { recordAudit } from '@/lib/audit';

// GET /api/people → { people } — admin/staff people dashboard data.
// Scoped to the caller's company; cross-phase columns degrade to "—".
export const GET = withAuth(
  async (_request: NextRequest, { companyId }) => {
    const people = await loadPeople(companyId);
    return NextResponse.json({ people });
  },
  { minRole: 'manager' }
);

// POST /api/people → { person, temp_password? } — create a user profile (Admin).
// Provisions auth user + app_user + employee and initialises onboarding.
export const POST = withAuth(
  async (request: NextRequest, { companyId, appUser }) => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const result = await createPerson({ companyId, ...body });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'people.created',
      target: { type: 'employee', id: result.person.id },
      meta: { role: result.person.role, email: result.person.email },
    });

    return NextResponse.json(
      { person: result.person, temp_password: result.tempPassword },
      { status: 201 }
    );
  },
  { minRole: 'admin' }
);
