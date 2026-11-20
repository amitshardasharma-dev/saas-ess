import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { withAuth } from '@/lib/auth-middleware';
import { hasMinRole } from '@/types/roles';

// GET /api/onboarding?employee_id=<uuid> → { state, steps, types }
// Defaults to the caller's own employee record when employee_id is omitted.
// Reading SOMEONE ELSE's checklist needs manager+.
export const GET = withAuth(async (request: NextRequest, { companyId, employee, role }) => {
  const url = new URL(request.url);
  const employeeId = url.searchParams.get('employee_id') ?? employee?.id ?? null;

  if (!employeeId) {
    return NextResponse.json({ error: 'employee_id required' }, { status: 400 });
  }
  if (employeeId !== employee?.id && !hasMinRole(role, 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: state, error: stateError } = await supabaseAdmin
    .from('ess_onboarding_states')
    .select('*')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (stateError) {
    return NextResponse.json({ error: stateError.message }, { status: 500 });
  }

  const [{ data: steps, error: stepsError }, { data: memberships }] = await Promise.all([
    supabaseAdmin
      .from('ess_onboarding_steps')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('ess_employee_volunteer_types')
      .select('volunteer_type_id, ess_volunteer_types ( id, name, sort_order )')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId),
  ]);

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 500 });
  }

  const types = (memberships ?? [])
    .map((m) => m.ess_volunteer_types as unknown as { id: string; name: string; sort_order: number } | null)
    .filter((t): t is { id: string; name: string; sort_order: number } => Boolean(t))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((t) => ({ id: t.id, name: t.name }));

  return NextResponse.json({ state: state ?? null, steps: steps ?? [], types });
});
