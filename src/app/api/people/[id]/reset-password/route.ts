import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { resetPersonPassword } from '@/lib/people-admin';

// POST /api/people/[id]/reset-password → { password, email } (Admin).
// Sets a fresh temporary password on the person's account, emails it to them,
// and returns it so the admin can relay it. Company-scoped; foreign-tenant → 404.
export const POST = withAuth(
  async (_request: NextRequest, { companyId, appUser }, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const result = await resetPersonPassword(id, companyId, appUser.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ password: result.password, email: result.email, name: result.name });
  },
  { minRole: 'admin' }
);
