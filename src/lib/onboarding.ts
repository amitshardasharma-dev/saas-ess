// Phase 2 — Onboarding state machine + published contracts.
// Other phases (3/5) depend on the EXACT names/signatures exported here.

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { UserRole } from '@/types/roles';
import type {
  OnboardingStatus,
  OnboardingStepStatus,
  OnboardingStep,
  OnboardingStepType,
} from '@/types/onboarding';

// Re-export the types (now defined in @/types/onboarding, a server-free module)
// so existing `@/lib/onboarding` type imports keep working.
export type {
  OnboardingStatus,
  OnboardingStepStatus,
  OnboardingStep,
  OnboardingState,
  OnboardingStepType,
  OnboardingRefKind,
} from '@/types/onboarding';

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
  const supabase = supabaseAdmin;

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

/**
 * Auto-complete the onboarding step that an artifact event satisfies.
 *
 * Finds THIS employee's auto_complete step matching (step_type, ref_id) that is
 * not already done, flips it to `done`, and recomputes the onboarding status.
 * Tenant-safe by construction: the lookup is keyed on employee_id (an employee
 * belongs to exactly one company), so an artifact event can only ever complete
 * the acting employee's own step — never another volunteer's and never a
 * cross-tenant row. No-op (returns false) when no matching pending step exists.
 *
 * Published contract — callers (e-sign, certification, training) depend on this.
 */
export async function completeLinkedOnboardingStep(
  employeeId: string,
  link: { stepType: OnboardingStepType; refId: string }
): Promise<boolean> {
  const supabase = supabaseAdmin;

  const { data: steps } = await supabase
    .from('ess_onboarding_steps')
    .select('id, status')
    .eq('employee_id', employeeId)
    .eq('step_type', link.stepType)
    .eq('ref_id', link.refId)
    .eq('auto_complete', true);

  const pending = (steps ?? []).filter((s) => s.status !== 'done');
  if (pending.length === 0) {
    return false;
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from('ess_onboarding_steps')
    .update({ status: 'done', completed_at: nowIso, updated_at: nowIso })
    .in(
      'id',
      pending.map((s) => s.id)
    );

  await advanceOnboarding(employeeId);
  return true;
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
  companyId: string,
  role?: UserRole
): Promise<void> {
  const supabase = supabaseAdmin;

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

  // Seed the checklist from the template for this person's audience
  // (volunteer vs staff), then fall back to the default template, then to the
  // built-in default steps.
  const audience = audienceForRole(role ?? 'employee');
  let { data: template } = await supabase
    .from('ess_onboarding_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('audience', audience)
    .maybeSingle();
  if (!template) {
    ({ data: template } = await supabase
      .from('ess_onboarding_templates')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_default', true)
      .maybeSingle());
  }

  if (template) {
    const { data: templateSteps } = await supabase
      .from('ess_onboarding_steps')
      .select('title, description, sort_order, step_type, ref_kind, ref_id, auto_complete')
      .eq('company_id', companyId)
      .eq('template_id', template.id)
      .order('sort_order', { ascending: true });

    // Carry the typed/linked definition (step_type/ref_kind/ref_id/auto_complete)
    // onto the employee instance so artifact events can find + auto-complete it.
    const rows = (templateSteps ?? []).map((s) => ({
      company_id: companyId,
      employee_id: employeeId,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      status: 'pending' as const,
      step_type: s.step_type ?? 'manual',
      ref_kind: s.ref_kind ?? null,
      ref_id: s.ref_id ?? null,
      auto_complete: s.auto_complete ?? false,
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

/* ===================== Editable onboarding templates ===================== */

export type OnboardingAudience = 'volunteer' | 'staff';

/** Volunteers (role 'employee') use the volunteer flow; everyone else the staff flow. */
export function audienceForRole(role: UserRole): OnboardingAudience {
  return role === 'employee' ? 'volunteer' : 'staff';
}

const AUDIENCE_NAME: Record<OnboardingAudience, string> = {
  volunteer: 'Volunteer Onboarding',
  staff: 'Staff Onboarding',
};

/** A single editable template step (the admin-facing shape). */
export interface TemplateStepInput {
  title: string;
  description: string | null;
  step_type: OnboardingStepType;
  ref_id: string | null;
  auto_complete: boolean;
}

/** Derive the ref_kind a step type links to (null for profile/manual). */
export function refKindForStepType(t: OnboardingStepType): 'document' | 'cert_type' | 'training_module' | null {
  if (t === 'doc_sign' || t === 'doc_ack') return 'document';
  if (t === 'certification') return 'cert_type';
  if (t === 'training') return 'training_module';
  return null;
}

/** Get (or lazily create) the template row for a company + audience. */
export async function ensureTemplate(
  companyId: string,
  audience: OnboardingAudience
): Promise<{ id: string; name: string }> {
  const { data: existing } = await supabaseAdmin
    .from('ess_onboarding_templates')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('audience', audience)
    .maybeSingle();
  if (existing) return existing as { id: string; name: string };

  const { data, error } = await supabaseAdmin
    .from('ess_onboarding_templates')
    .insert({
      company_id: companyId,
      name: AUDIENCE_NAME[audience],
      description: `${AUDIENCE_NAME[audience]} flow`,
      audience,
      is_default: audience === 'volunteer',
    })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(`ensureTemplate ${audience}: ${error?.message ?? 'no row'}`);
  return data as { id: string; name: string };
}

/** Load a template + its ordered steps for editing. */
export async function loadTemplate(companyId: string, audience: OnboardingAudience) {
  const t = await ensureTemplate(companyId, audience);
  const { data: steps } = await supabaseAdmin
    .from('ess_onboarding_steps')
    .select('title, description, sort_order, step_type, ref_kind, ref_id, auto_complete')
    .eq('company_id', companyId)
    .eq('template_id', t.id)
    .is('employee_id', null)
    .order('sort_order', { ascending: true });
  return { id: t.id, name: t.name, audience, steps: steps ?? [] };
}

/** Replace a template's steps with the supplied ordered list. */
export async function saveTemplateSteps(
  companyId: string,
  audience: OnboardingAudience,
  steps: TemplateStepInput[]
): Promise<void> {
  const t = await ensureTemplate(companyId, audience);
  await supabaseAdmin
    .from('ess_onboarding_steps')
    .delete()
    .eq('company_id', companyId)
    .eq('template_id', t.id)
    .is('employee_id', null);
  if (steps.length === 0) return;
  await supabaseAdmin.from('ess_onboarding_steps').insert(
    steps.map((s, i) => ({
      company_id: companyId,
      template_id: t.id,
      employee_id: null,
      title: s.title,
      description: s.description ?? null,
      sort_order: i,
      status: 'pending' as const,
      step_type: s.step_type,
      ref_kind: refKindForStepType(s.step_type),
      ref_id: s.ref_id ?? null,
      auto_complete: s.auto_complete ?? false,
    }))
  );
}
