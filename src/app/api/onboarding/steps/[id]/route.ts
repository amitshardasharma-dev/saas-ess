import { NextResponse } from 'next/server';
import { withAuth, createRouteClient } from '@/lib/auth-middleware';
import { recordAudit } from '@/lib/audit';
import { advanceOnboarding } from '@/lib/onboarding';
import type { OnboardingStepStatus } from '@/lib/onboarding';

const VALID_STEP_STATUSES: OnboardingStepStatus[] = ['pending', 'done', 'skipped'];

// PATCH /api/onboarding/steps/[id] → { step }  (body: { status })
export const PATCH = withAuth(async (req, ctx) => {
  const supabase = createRouteClient();

  // Next 15 dynamic route params arrive via the request URL.
  const segments = new URL(req.url).pathname.split('/');
  const stepId = segments[segments.length - 1];

  const body = (await req.json()) as { status?: string };
  const status = body.status as OnboardingStepStatus | undefined;

  if (!status || !VALID_STEP_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    completed_at: status === 'done' ? new Date().toISOString() : null,
  };

  const { data: step, error } = await supabase
    .from('ess_onboarding_steps')
    .update(patch)
    .eq('id', stepId)
    .eq('company_id', ctx.companyId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAudit({
    companyId: ctx.companyId,
    actorId: ctx.userId,
    action: 'onboarding.step.updated',
    target: { type: 'onboarding_step', id: stepId },
    meta: { status },
  });

  // Recompute the parent onboarding state.
  if (step?.employee_id) {
    await advanceOnboarding(step.employee_id);
  }

  return NextResponse.json({ step });
});
