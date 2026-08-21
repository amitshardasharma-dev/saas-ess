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

/**
 * Push a template's steps onto the people who already exist.
 *
 * Editing an onboarding flow used to affect only future joiners, which meant a
 * newly required policy silently skipped everyone already on the books — wrong
 * for a compliance product. Saving a flow now syncs it to existing people.
 *
 * The sync is deliberately additive-and-safe:
 *  - ADD    steps that are missing. If the person has ALREADY done the linked
 *           artifact (signed/acknowledged that document, holds that certificate,
 *           finished that training) the step lands `done`, so nobody is asked to
 *           redo work they have already completed.
 *  - UPDATE the wording/order of steps that still match.
 *  - REMOVE steps that are no longer in the flow ONLY where they are not `done`.
 *           A completed step is evidence of a decision and is never deleted.
 *  - NEVER  reset a completed step.
 *
 * Steps are matched on their natural key: the linked artifact when there is one
 * (step_type + ref_id), otherwise the title.
 *
 * Set-based on purpose: a per-person/per-step loop is O(people x steps) round
 * trips, which times out on a tenant with hundreds of volunteers. Everything is
 * read in a handful of bulk queries, diffed in memory, then written in batches.
 */
export async function syncTemplateToExistingPeople(
  companyId: string,
  audience: OnboardingAudience
): Promise<{ people: number; added: number; removed: number; autoCompleted: number }> {
  const supabase = supabaseAdmin;
  const stats = { people: 0, added: 0, removed: 0, autoCompleted: 0 };

  const tpl = await loadTemplate(companyId, audience);
  const templateSteps = (tpl?.steps ?? []) as unknown as Array<{
    title: string; description: string | null; step_type: OnboardingStepType;
    ref_kind: string | null; ref_id: string | null; auto_complete: boolean;
  }>;

  // --- Who is in scope -------------------------------------------------------
  const { data: appUsers } = await supabase
    .from('ess_app_users')
    .select('id, role')
    .eq('company_id', companyId);
  const wantedUserIds = (appUsers ?? [])
    .filter((u) => audienceForRole((u as { role: UserRole }).role) === audience)
    .map((u) => (u as { id: string }).id);
  if (wantedUserIds.length === 0) return stats;

  const { data: employees } = await supabase
    .from('ess_employees')
    .select('id, app_user_id')
    .eq('company_id', companyId)
    .in('app_user_id', wantedUserIds);
  const empIds = (employees ?? []).map((e) => (e as { id: string }).id);
  if (empIds.length === 0) return stats;

  // Only people who already have a checklist; a missing one is initOnboarding's job.
  const { data: states } = await supabase
    .from('ess_onboarding_states')
    .select('employee_id')
    .eq('company_id', companyId)
    .in('employee_id', empIds);
  const withState = new Set((states ?? []).map((s) => (s as { employee_id: string }).employee_id));
  const targets = empIds.filter((id) => withState.has(id));
  if (targets.length === 0) return stats;

  // --- Bulk reads ------------------------------------------------------------
  const { data: allSteps } = await supabase
    .from('ess_onboarding_steps')
    .select('id, employee_id, title, description, status, step_type, ref_id, sort_order')
    .eq('company_id', companyId)
    .in('employee_id', targets);

  const satisfied = await loadSatisfiedArtifacts(companyId, targets);

  const keyOf = (s: { step_type?: string | null; ref_id?: string | null; title: string }) =>
    s.ref_id ? `${s.step_type ?? 'manual'}::${s.ref_id}` : `${s.step_type ?? 'manual'}::${s.title}`;

  const mineByEmp = new Map<string, Array<Record<string, unknown>>>();
  for (const row of allSteps ?? []) {
    const eid = (row as { employee_id: string }).employee_id;
    if (!mineByEmp.has(eid)) mineByEmp.set(eid, []);
    mineByEmp.get(eid)!.push(row as Record<string, unknown>);
  }

  const wantedKeys = new Set(templateSteps.map((t) => keyOf(t)));
  const toInsert: Array<Record<string, unknown>> = [];
  const toDelete: string[] = [];
  const toUpdate: Array<{ id: string; title: string; description: string | null; sort_order: number }> = [];
  const touchedEmployees = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const empId of targets) {
    const mine = mineByEmp.get(empId) ?? [];
    const byKey = new Map(mine.map((s) => [keyOf(s as never), s]));

    templateSteps.forEach((t, i) => {
      const existing = byKey.get(keyOf(t));
      if (existing) {
        const e = existing as { id: string; title: string; description: string | null; sort_order: number };
        if (e.title !== t.title || (e.description ?? null) !== (t.description ?? null) || e.sort_order !== i) {
          toUpdate.push({ id: e.id, title: t.title, description: t.description ?? null, sort_order: i });
        }
        return;
      }
      const already = isSatisfied(satisfied, empId, t.step_type, t.ref_id);
      toInsert.push({
        company_id: companyId,
        employee_id: empId,
        title: t.title,
        description: t.description ?? null,
        sort_order: i,
        status: already ? 'done' : 'pending',
        completed_at: already ? nowIso : null,
        step_type: t.step_type,
        ref_kind: t.ref_kind ?? null,
        ref_id: t.ref_id ?? null,
        auto_complete: t.auto_complete ?? false,
      });
      stats.added += 1;
      if (already) stats.autoCompleted += 1;
      touchedEmployees.add(empId);
    });

    for (const s of mine) {
      const row = s as { id: string; status: OnboardingStepStatus };
      if (wantedKeys.has(keyOf(s as never))) continue;
      if (row.status === 'done') continue; // evidence: keep it
      toDelete.push(row.id);
      stats.removed += 1;
      touchedEmployees.add(empId);
    }
  }

  // --- Bulk writes -----------------------------------------------------------
  const CHUNK = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    await supabase.from('ess_onboarding_steps').insert(toInsert.slice(i, i + CHUNK));
  }
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    await supabase.from('ess_onboarding_steps').delete().in('id', toDelete.slice(i, i + CHUNK));
  }
  // Wording/order changes are usually few; apply them in parallel batches.
  for (let i = 0; i < toUpdate.length; i += 50) {
    await Promise.all(
      toUpdate.slice(i, i + 50).map((u) =>
        supabase
          .from('ess_onboarding_steps')
          .update({ title: u.title, description: u.description, sort_order: u.sort_order })
          .eq('id', u.id)
      )
    );
  }

  stats.people = touchedEmployees.size;
  // Recompute in parallel batches — serially this is one round trip per person,
  // which dominates the request on a large tenant.
  const touched = [...touchedEmployees];
  for (let i = 0; i < touched.length; i += 25) {
    await Promise.all(touched.slice(i, i + 25).map((id) => advanceOnboarding(id)));
  }
  return stats;
}

/** Bulk-load what these people have already satisfied, keyed for O(1) lookup. */
async function loadSatisfiedArtifacts(companyId: string, employeeIds: string[]) {
  const supabase = supabaseAdmin;
  const set = new Set<string>();
  const add = (rows: Array<Record<string, unknown>> | null, kind: string, col: string) => {
    for (const r of rows ?? []) set.add(`${kind}::${r.employee_id as string}::${r[col] as string}`);
  };
  try {
    const [signedRes, ackRes, certRes, trainRes] = await Promise.all([
      supabase.from('ess_signed_documents').select('employee_id, document_id').eq('company_id', companyId).in('employee_id', employeeIds),
      // no company_id column on acknowledgments; employee scoping is sufficient
      supabase.from('ess_document_acknowledgments').select('employee_id, document_id').in('employee_id', employeeIds),
      supabase.from('ess_certifications').select('employee_id, cert_type_id').eq('company_id', companyId).in('employee_id', employeeIds),
      supabase.from('ess_training_progress').select('employee_id, module_id').eq('company_id', companyId).eq('status', 'complete').in('employee_id', employeeIds),
    ]);
    add(signedRes.data as never, 'doc_sign', 'document_id');
    add(ackRes.data as never, 'doc_ack', 'document_id');
    add(certRes.data as never, 'certification', 'cert_type_id');
    add(trainRes.data as never, 'training', 'module_id');
  } catch {
    // never block a sync on a detection failure — steps just start pending
  }
  return set;
}

function isSatisfied(
  satisfied: Set<string>,
  employeeId: string,
  stepType: OnboardingStepType,
  refId: string | null
): boolean {
  if (!refId) return false;
  return satisfied.has(`${stepType}::${employeeId}::${refId}`);
}
