import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { withAuth } from '@/lib/auth-middleware';
import { recordAudit } from '@/lib/audit';
import { advanceOnboarding } from '@/lib/onboarding';
import type { OnboardingStepStatus } from '@/lib/onboarding';

const VALID_STEP_STATUSES: OnboardingStepStatus[] = ['pending', 'done', 'skipped'];

// PATCH /api/onboarding/steps/[id] → { step }  (body: { status })
export const PATCH = withAuth(
  async (request: NextRequest, { companyId, appUser }, params) => {
    const stepId = params?.id;
    if (!stepId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = (await request.json()) as { status?: string };
    const status = body.status as OnboardingStepStatus | undefined;

    if (!status || !VALID_STEP_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }

    // Ownership re-check: cross-tenant rows return 404 (do not reveal existence).
    const { data: existing } = await supabaseAdmin
      .from('ess_onboarding_steps')
      .select('id, company_id, employee_id')
      .eq('id', stepId)
      .single();

    if (!existing || existing.company_id !== companyId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      completed_at: status === 'done' ? new Date().toISOString() : null,
    };

    const { data: step, error } = await supabaseAdmin
      .from('ess_onboarding_steps')
      .update(patch)
      .eq('id', stepId)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'onboarding.step.updated',
      target: { type: 'onboarding_step', id: stepId },
      meta: { status },
    });

    // Recompute the parent onboarding state.
    if (existing.employee_id) {
      await advanceOnboarding(existing.employee_id);
    }

    return NextResponse.json({ step });
  },
  { minRole: 'employee' }
);
