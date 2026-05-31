import { NextResponse } from 'next/server';
import { withAuth, createRouteClient } from '@/lib/auth-middleware';

// GET /api/onboarding?employee_id=<uuid> → { state, steps }
// Defaults to the caller's own employee record when employee_id is omitted.
export const GET = withAuth(async (req, ctx) => {
  const supabase = createRouteClient();
  const url = new URL(req.url);
  const employeeId = url.searchParams.get('employee_id') ?? ctx.employeeId;

  if (!employeeId) {
    return NextResponse.json({ error: 'employee_id required' }, { status: 400 });
  }

  const { data: state, error: stateError } = await supabase
    .from('ess_onboarding_states')
    .select('*')
    .eq('company_id', ctx.companyId)
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (stateError) {
    return NextResponse.json({ error: stateError.message }, { status: 500 });
  }

  const { data: steps, error: stepsError } = await supabase
    .from('ess_onboarding_steps')
    .select('*')
    .eq('company_id', ctx.companyId)
    .eq('employee_id', employeeId)
    .order('sort_order', { ascending: true });

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 500 });
  }

  return NextResponse.json({ state: state ?? null, steps: steps ?? [] });
});
