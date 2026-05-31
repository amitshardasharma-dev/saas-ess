// Phase 2 — Onboarding state machine + published contracts.
// Other phases (3/5) depend on the EXACT names/signatures exported here.

import { createRouteClient } from '@/lib/auth-middleware';

export type OnboardingStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'completed';

export type OnboardingStepStatus = 'pending' | 'done' | 'skipped';

export interface OnboardingStep {
  id: string;
  company_id: string;
  template_id: string | null;
  employee_id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  status: OnboardingStepStatus;
  completed_at: string | null;
}

export interface OnboardingState {
  id: string;
  company_id: string;
  employee_id: string;
  status: OnboardingStatus;
  blocked_reason: string | null;
  completed_at: string | null;
}

/**
 * Pure status computation — given an employee's steps and whether the state row
 * is explicitly blocked, return the next onboarding status. No I/O, so it is
 * unit-testable in a node environment.
 *
 * Rules (spec §4):
 * - No steps                         → not_started
 * - Explicitly blocked               → blocked (caller keeps blocked_reason)
 * - All steps done/skipped           → completed
 * - At least one done, not all       → in_progress
 * - Steps exist but none done        → not_started
 */
export function computeOnboardingStatus(
  steps: Pick<OnboardingStep, 'status'>[],
  isBlocked = false
): OnboardingStatus {
  if (isBlocked) {
    return 'blocked';
  }
  if (steps.length === 0) {
    return 'not_started';
  }
  const isResolved = (s: OnboardingStepStatus) => s === 'done' || s === 'skipped';
  const allResolved = steps.every((s) => isResolved(s.status));
  if (allResolved) {
    return 'completed';
  }
  const anyDone = steps.some((s) => s.status === 'done');
  return anyDone ? 'in_progress' : 'not_started';
}

/**
 * Recomputes and persists the onboarding status for an employee.
 * Returns the computed status. Published contract — do NOT rename.
 */
export async function advanceOnboarding(
  employeeId: string
): Promise<OnboardingStatus> {
  const supabase = createRouteClient();

  const { data: steps } = await supabase
    .from('ess_onboarding_steps')
    .select('status')
    .eq('employee_id', employeeId);

  const { data: state } = await supabase
    .from('ess_onboarding_states')
    .select('id, status, blocked_reason')
    .eq('employee_id', employeeId)
    .single();

  const isBlocked = state?.status === 'blocked';
  const status = computeOnboardingStatus(
    (steps ?? []) as Pick<OnboardingStep, 'status'>[],
    isBlocked
  );

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'completed') {
    patch.completed_at = new Date().toISOString();
  }
  if (status !== 'blocked') {
    patch.blocked_reason = null;
  }

  await supabase
    .from('ess_onboarding_states')
    .update(patch)
    .eq('employee_id', employeeId);

  return status;
}

const DEFAULT_STEPS: { title: string; description: string; sort_order: number }[] = [
  { title: 'Complete your profile', description: 'Add your personal details.', sort_order: 0 },
  { title: 'Review the volunteer handbook', description: 'Read and acknowledge the handbook.', sort_order: 1 },
  { title: 'Sign required documents', description: 'Complete any documents assigned to you.', sort_order: 2 },
  { title: 'Meet your team', description: 'Introductory session with your org unit.', sort_order: 3 },
];

/**
 * Initialises an onboarding state row + a checklist for a newly created
 * employee. Idempotent: skips if a state row already exists.
 * Published contract — do NOT rename.
 */
export async function initOnboarding(
  employeeId: string,
  companyId: string
): Promise<void> {
  const supabase = createRouteClient();

  const { data: existing } = await supabase
    .from('ess_onboarding_states')
    .select('id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (existing) {
    return;
  }

  await supabase.from('ess_onboarding_states').insert({
    company_id: companyId,
    employee_id: employeeId,
    status: 'not_started',
  });

  // Seed the checklist from the default template if one exists, otherwise
  // fall back to the built-in default steps.
  const { data: template } = await supabase
    .from('ess_onboarding_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_default', true)
    .maybeSingle();

  if (template) {
    const { data: templateSteps } = await supabase
      .from('ess_onboarding_steps')
      .select('title, description, sort_order')
      .eq('company_id', companyId)
      .eq('template_id', template.id)
      .order('sort_order', { ascending: true });

    const rows = (templateSteps ?? []).map((s) => ({
      company_id: companyId,
      employee_id: employeeId,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      status: 'pending' as const,
    }));
    if (rows.length > 0) {
      await supabase.from('ess_onboarding_steps').insert(rows);
      return;
    }
  }

  await supabase.from('ess_onboarding_steps').insert(
    DEFAULT_STEPS.map((s) => ({
      company_id: companyId,
      employee_id: employeeId,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      status: 'pending' as const,
    }))
  );
}
