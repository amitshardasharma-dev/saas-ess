import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { withAuth } from '@/lib/auth-middleware';
import { recordAudit } from '@/lib/audit';
import { advanceOnboarding } from '@/lib/onboarding';
import type { OnboardingStepStatus } from '@/lib/onboarding';
import { hasMinRole } from '@/types/roles';

const VALID_STEP_STATUSES: OnboardingStepStatus[] = ['pending', 'done', 'skipped'];

// PATCH /api/onboarding/steps/[id] → { step }  (body: { status, reason? })
//   done / pending : staff (manager+) tick a step, or undo it.
//   skipped        : "not needed" for this person — admin only. The app records
//                    who did it, when, and the optional reason.
// Volunteers never call this: their steps complete when they do the real thing.
export const PATCH = withAuth(
  async (request: NextRequest, { companyId, appUser, role }, params) => {
    const stepId = params?.id;
    if (!stepId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { status?: string; reason?: unknown };
    const status = body.status as OnboardingStepStatus | undefined;

    if (!status || !VALID_STEP_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    if (status === 'skipped' && !hasMinRole(role, 'admin')) {
      return NextResponse.json({ error: 'Only an admin can mark a step as not needed' }, { status: 403 });
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

    // Ownership re-check: cross-tenant rows return 404 (do not reveal existence).
    const { data: existing } = await supabaseAdmin
      .from('ess_onboarding_steps')
      .select('id, company_id, employee_id, status, title')
      .eq('id', stepId)
      .maybeSingle();

    if (!existing || existing.company_id !== companyId || !existing.employee_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      updated_at: nowIso,
      completed_at: status === 'done' ? nowIso : null,
      waived_by: status === 'skipped' ? appUser.id : null,
      waived_at: status === 'skipped' ? nowIso : null,
      waive_reason: status === 'skipped' ? reason || null : null,
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
      action: status === 'skipped' ? 'onboarding.step.not_needed' : 'onboarding.step.updated',
      target: { type: 'onboarding_step', id: stepId },
      meta: { status, from: existing.status, title: existing.title, employeeId: existing.employee_id, ...(reason ? { reason } : {}) },
    });

    // Recompute the parent onboarding state.
    const onboardingStatus = await advanceOnboarding(existing.employee_id);

    return NextResponse.json({ step, status: onboardingStatus });
  },
  { minRole: 'manager' }
);

// DELETE /api/onboarding/steps/[id] — remove a PERSONAL step that is not done
// (admin). Flow steps cannot be deleted for one person: mark them "not needed"
// instead, so the next flow sync does not add them back.
export const DELETE = withAuth(
  async (_request: NextRequest, { companyId, appUser }, params) => {
    const stepId = params?.id;
    if (!stepId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: existing } = await supabaseAdmin
      .from('ess_onboarding_steps')
      .select('id, company_id, employee_id, status, origin, title')
      .eq('id', stepId)
      .maybeSingle();
    if (!existing || existing.company_id !== companyId || !existing.employee_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.origin !== 'personal') {
      return NextResponse.json({ error: 'This step comes from a flow. Mark it as not needed instead.' }, { status: 400 });
    }
    if (existing.status === 'done') {
      return NextResponse.json({ error: 'A completed step cannot be removed' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('ess_onboarding_steps').delete().eq('id', stepId).eq('company_id', companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordAudit({
      companyId,
      actorId: appUser.id,
      action: 'onboarding.step.removed',
      target: { type: 'employee', id: existing.employee_id },
      meta: { stepId, title: existing.title },
    });

    const status = await advanceOnboarding(existing.employee_id);
    return NextResponse.json({ ok: true, status });
  },
  { minRole: 'admin' }
);
