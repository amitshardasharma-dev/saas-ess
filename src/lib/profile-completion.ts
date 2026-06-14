// Data-driven completion of the "Complete your profile" onboarding step.
// The step is marked done ONLY when the mandatory profile fields are actually
// filled — never by a manual self-tick — and reverts to pending if cleared.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { advanceOnboarding } from '@/lib/onboarding';

/** Fields a volunteer must provide for "contact details + emergency contact". */
export const MANDATORY_PROFILE_FIELDS = [
  'phone',
  'emergency_contact_name',
  'emergency_contact_phone',
] as const;

/** Every profile field the volunteer can self-edit. */
export const EDITABLE_PROFILE_FIELDS = [
  'full_name',
  'phone',
  'address',
  'date_of_birth',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
] as const;

function filled(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/** True when every mandatory profile field is non-empty. */
export function isProfileComplete(emp: Record<string, unknown> | null | undefined): boolean {
  if (!emp) return false;
  return MANDATORY_PROFILE_FIELDS.every((f) => filled(emp[f]));
}

/** The mandatory fields still missing (for UI prompting). */
export function missingProfileFields(emp: Record<string, unknown> | null | undefined): string[] {
  if (!emp) return [...MANDATORY_PROFILE_FIELDS];
  return MANDATORY_PROFILE_FIELDS.filter((f) => !filled(emp[f]));
}

/**
 * Reconcile the employee's `profile_field` onboarding step with the actual
 * completeness of their mandatory profile data, then recompute onboarding
 * status. Marks done when complete, reverts to pending when not (never touches a
 * step the user/staff explicitly skipped). No-op if there is no profile step.
 */
export async function syncProfileOnboardingStep(employeeId: string): Promise<void> {
  const { data: emp } = await supabaseAdmin
    .from('ess_employees')
    .select('phone, emergency_contact_name, emergency_contact_phone')
    .eq('id', employeeId)
    .single();
  if (!emp) return;

  const complete = isProfileComplete(emp as Record<string, unknown>);
  const target = complete ? 'done' : 'pending';

  const { data: steps } = await supabaseAdmin
    .from('ess_onboarding_steps')
    .select('id, status')
    .eq('employee_id', employeeId)
    .eq('step_type', 'profile_field');

  const now = new Date().toISOString();
  for (const s of steps ?? []) {
    if (s.status === 'skipped' || s.status === target) continue;
    await supabaseAdmin
      .from('ess_onboarding_steps')
      .update({ status: target, completed_at: target === 'done' ? now : null, updated_at: now })
      .eq('id', s.id);
  }

  await advanceOnboarding(employeeId);
}
