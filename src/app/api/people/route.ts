import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { loadPeople } from '@/app/dashboard/people/people-data';

// GET /api/people → { people } — admin/staff people dashboard data.
// Scoped to the caller's company; cross-phase columns degrade to "—".
export const GET = withAuth(
  async (_request: NextRequest, { companyId }) => {
    const people = await loadPeople(companyId);
    return NextResponse.json({ people });
  },
  { minRole: 'manager' }
);
