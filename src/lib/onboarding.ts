// Phase 2 — Onboarding state machine + published contracts.
// Other phases (3/5) depend on the EXACT names/signatures exported here.
//
// A person's checklist is built from flows (templates):
//   - the BASE flow for their audience (volunteer / staff), and
//   - the flow of each VOLUNTEER TYPE they have (Op shop, Events, ...).
// Duplicate steps across flows appear once. An admin can also add PERSONAL
// steps for one person, and mark any step "not needed" (status 'skipped').
// When every mandatory step is resolved the status is 'completed' (= ready for
// approval). An admin approval turns it into 'approved'.

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { UserRole } from '@/types/roles';
import type {
  OnboardingStatus,
  OnboardingStepStatus,
  OnboardingStepType,
  OnboardingStepOrigin,
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
  OnboardingStepOrigin,
} from '@/types/onboarding';

/* ============================== Status rules ============================== */

const isResolved = (s: OnboardingStepStatus | string) => s === 'done' || s === 'skipped';

/**
 * Pure status computation — given an employee's steps, whether the state row
 * is explicitly blocked and whether an admin approved the person, return the
 * onboarding status. No I/O, so it is unit-testable in a node environment.
 *
 * Rules:
 * - Explicitly blocked                          → blocked
 * - No steps                                    → approved if approved, else not_started
 * - Every MANDATORY step done/skipped           → approved if approved, else completed
 *   (optional steps never hold a person back)
 * - At least one step done                      → in_progress
 * - Otherwise                                   → not_started
 *
 * An approval is kept when new mandatory steps appear later (for example after
 * a type change): the person shows in_progress until those steps are resolved,
 * then returns to approved. An admin can revoke an approval at any time.
 */
export function computeOnboardingStatus(
  steps: Array<{ status: OnboardingStepStatus | string; is_required?: boolean | null }>,
  isBlocked = false,
  isApproved = false
): OnboardingStatus {
  if (isBlocked) {
    return 'blocked';
  }
  if (steps.length === 0) {
    return isApproved ? 'approved' : 'not_started';
  }
  const required = steps.filter((s) => s.is_required !== false);
  if (required.every((s) => isResolved(s.status))) {
    return isApproved ? 'approved' : 'completed';
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

  const [{ data: steps }, { data: state }] = await Promise.all([
    supabase.from('ess_onboarding_steps').select('status, is_required').eq('employee_id', employeeId),
    supabase
      .from('ess_onboarding_states')
      .select('id, status, blocked_reason, completed_at, approved_at')
      .eq('employee_id', employeeId)
      .maybeSingle(),
  ]);

  const isBlocked = state?.status === 'blocked';
  const isApproved = Boolean(state?.approved_at);
  const status = computeOnboardingStatus(
    (steps ?? []) as Array<{ status: string; is_required: boolean }>,
    isBlocked,
    isApproved
  );

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: nowIso };
  if (status === 'completed' || status === 'approved') {
    if (!state?.completed_at) patch.completed_at = nowIso;
  } else if (status !== 'blocked') {
    patch.completed_at = null;
  }
  if (status !== 'blocked') {
    patch.blocked_reason = null;
  }

  await supabase.from('ess_onboarding_states').update(patch).eq('employee_id', employeeId);

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

  // A step an admin marked "not needed" stays that way.
  const pending = (steps ?? []).filter((s) => s.status === 'pending');
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

/* ========================= Flow (template) steps ========================== */

/** One step as a flow defines it (template step, before it is copied to a person). */
export interface FlowStep {
  title: string;
  description: string | null;
  step_type: OnboardingStepType;
  ref_kind: string | null;
  ref_id: string | null;
  auto_complete: boolean;
  is_required: boolean;
}

/** One step on a person's checklist, as the sync needs to see it. */
export interface PersonStep {
  id: string;
  title: string;
  description: string | null;
  status: OnboardingStepStatus | string;
  step_type: OnboardingStepType | string | null;
  ref_id: string | null;
  sort_order: number;
  is_required: boolean;
  origin: OnboardingStepOrigin | string;
}

/**
 * The natural key that identifies "the same step" across flows and on a
 * person's checklist: the linked artifact when there is one, else the title.
 */
export function stepKey(s: { step_type?: string | null; ref_id?: string | null; title: string }): string {
  const type = s.step_type ?? 'manual';
  return s.ref_id ? `${type}::${s.ref_id}` : `${type}::${s.title.trim().toLowerCase()}`;
}

/**
 * Join several flows into one ordered list. A step that is in more than one
 * flow appears once, at its first position. It is mandatory if any flow says
 * so, and auto-completes if any flow says so.
 */
export function mergeFlowSteps(flows: FlowStep[][]): FlowStep[] {
  const out: FlowStep[] = [];
  const byKey = new Map<string, FlowStep>();
  for (const flow of flows) {
    for (const s of flow) {
      const k = stepKey(s);
      const seen = byKey.get(k);
      if (seen) {
        seen.is_required = seen.is_required || s.is_required;
        seen.auto_complete = seen.auto_complete || s.auto_complete;
        continue;
      }
      const copy = { ...s };
      byKey.set(k, copy);
      out.push(copy);
    }
  }
  return out;
}

export interface ChecklistPlan {
  insert: Array<FlowStep & { sort_order: number; status: 'pending' | 'done' }>;
  update: Array<{ id: string; title: string; description: string | null; sort_order: number; is_required: boolean }>;
  remove: string[];
}

/**
 * Pure diff between a person's checklist and the steps their flows want.
 *
 *  - ADD    wanted steps that are missing (done at once if already satisfied).
 *  - UPDATE wording / order / mandatory flag of flow steps that still match.
 *  - REMOVE flow steps no flow wants any more, ONLY when not `done`.
 *  - NEVER  touch personal steps, never reset a status, never delete a done step.
 */
export function planChecklistSync(
  existing: PersonStep[],
  wanted: FlowStep[],
  isSatisfied: (s: FlowStep) => boolean
): ChecklistPlan {
  const plan: ChecklistPlan = { insert: [], update: [], remove: [] };
  const byKey = new Map<string, PersonStep>();
  for (const s of existing) byKey.set(stepKey({ ...s, title: s.title }), s);
  const wantedKeys = new Set<string>();

  wanted.forEach((w, i) => {
    const k = stepKey(w);
    wantedKeys.add(k);
    const e = byKey.get(k);
    if (e) {
      if (e.origin === 'personal') return;
      if (
        e.title !== w.title ||
        (e.description ?? null) !== (w.description ?? null) ||
        e.sort_order !== i ||
        e.is_required !== w.is_required
      ) {
        plan.update.push({ id: e.id, title: w.title, description: w.description ?? null, sort_order: i, is_required: w.is_required });
      }
      return;
    }
    plan.insert.push({ ...w, sort_order: i, status: isSatisfied(w) ? 'done' : 'pending' });
  });

  for (const e of existing) {
    if (e.origin === 'personal') continue;
    if (e.status === 'done') continue; // evidence: keep it
    if (wantedKeys.has(stepKey({ ...e, title: e.title }))) continue;
    plan.remove.push(e.id);
  }
  return plan;
}

const DEFAULT_STEPS: { title: string; description: string; sort_order: number }[] = [
  { title: 'Complete your profile', description: 'Add your personal details.', sort_order: 0 },
  { title: 'Review the volunteer handbook', description: 'Read and acknowledge the handbook.', sort_order: 1 },
  { title: 'Sign required documents', description: 'Complete any documents assigned to you.', sort_order: 2 },
  { title: 'Meet your team', description: 'Introductory session with your org unit.', sort_order: 3 },
];

/** The built-in checklist for a company that has never saved a flow. */
const DEFAULT_FLOW: FlowStep[] = DEFAULT_STEPS.map((s) => ({
  title: s.title,
  description: s.description,
  step_type: 'manual',
  ref_kind: null,
  ref_id: null,
  auto_complete: false,
  is_required: true,
}));

/**
 * The base flow for an audience: its own template, else the default template.
 * A missing or EMPTY base template gives the starter steps (DEFAULT_FLOW), as
 * before volunteer types. Opening the Onboarding Flows page creates empty
 * templates, so "empty" must not mean "no steps for new people".
 */
export function pickBaseFlow(
  baseTemplates: Array<{ id: string; audience: string; is_default: boolean }>,
  stepsByTemplate: Map<string, FlowStep[]>,
  audience: OnboardingAudience
): FlowStep[] {
  const t = baseTemplates.find((x) => x.audience === audience) ?? baseTemplates.find((x) => x.is_default);
  const steps = t ? stepsByTemplate.get(t.id) ?? [] : [];
  return steps.length > 0 ? steps : DEFAULT_FLOW;
}

/** The starter steps, as an admin sees them on an empty base flow. */
export function starterFlowSteps(): FlowStep[] {
  return DEFAULT_FLOW.map((s) => ({ ...s }));
}

/* ================================ Helpers ================================= */

const PAGE = 1000;

/** Read every row of a query, 1000 at a time. Throws on error: a sync must
 *  never act on a partial read (it could delete steps that are still wanted). */
export async function fetchAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(`onboarding read failed: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toFlowStep(r: Record<string, unknown>): FlowStep {
  return {
    title: String(r.title ?? ''),
    description: (r.description as string | null) ?? null,
    step_type: ((r.step_type as OnboardingStepType) ?? 'manual'),
    ref_kind: (r.ref_kind as string | null) ?? null,
    ref_id: (r.ref_id as string | null) ?? null,
    auto_complete: Boolean(r.auto_complete),
    is_required: r.is_required !== false,
  };
}

/* ================================== Sync ================================== */

export interface SyncStats {
  people: number;
  added: number;
  removed: number;
  autoCompleted: number;
}

/**
 * Bring people's checklists in line with their flows (base flow for their
 * audience + the flow of each of their volunteer types). See planChecklistSync
 * for the rules. Only people who already have an onboarding state row are
 * synced (creating the first checklist is initOnboarding's job).
 *
 * Filters (combine with AND): employeeIds, audience, volunteerTypeId.
 * With no filter, every person in the company is synced.
 *
 * Set-based on purpose: a per-person/per-step loop is O(people x steps) round
 * trips, which times out on a tenant with hundreds of volunteers. Everything is
 * read in a handful of bulk queries, diffed in memory, then written in batches.
 */
export async function syncOnboardingForPeople(
  companyId: string,
  filter: { employeeIds?: string[]; audience?: OnboardingAudience; volunteerTypeId?: string } = {}
): Promise<SyncStats> {
  const supabase = supabaseAdmin;
  const stats: SyncStats = { people: 0, added: 0, removed: 0, autoCompleted: 0 };

  // --- Who is in scope -------------------------------------------------------
  type Emp = { id: string; app_user_id: string | null };
  let employees: Emp[];
  if (filter.employeeIds) {
    if (filter.employeeIds.length === 0) return stats;
    employees = [];
    for (const ids of chunk(filter.employeeIds, 100)) {
      const { data, error } = await supabase
        .from('ess_employees')
        .select('id, app_user_id')
        .eq('company_id', companyId)
        .in('id', ids);
      if (error) throw new Error(`onboarding read failed: ${error.message}`);
      employees.push(...((data ?? []) as Emp[]));
    }
  } else {
    employees = await fetchAll<Emp>((from, to) =>
      supabase.from('ess_employees').select('id, app_user_id').eq('company_id', companyId).order('id').range(from, to)
    );
  }

  const appUsers = await fetchAll<{ id: string; role: UserRole }>((from, to) =>
    supabase.from('ess_app_users').select('id, role').eq('company_id', companyId).order('id').range(from, to)
  );
  const roleByAppUser = new Map(appUsers.map((u) => [u.id, u.role]));
  const audienceOf = (e: Emp): OnboardingAudience =>
    audienceForRole((e.app_user_id ? roleByAppUser.get(e.app_user_id) : undefined) ?? 'employee');

  const memberships = await fetchAll<{ employee_id: string; volunteer_type_id: string }>((from, to) =>
    supabase
      .from('ess_employee_volunteer_types')
      .select('employee_id, volunteer_type_id')
      .eq('company_id', companyId)
      .order('employee_id')
      .order('volunteer_type_id')
      .range(from, to)
  );
  const typesByEmployee = new Map<string, string[]>();
  for (const m of memberships) {
    if (!typesByEmployee.has(m.employee_id)) typesByEmployee.set(m.employee_id, []);
    typesByEmployee.get(m.employee_id)!.push(m.volunteer_type_id);
  }

  if (filter.audience) employees = employees.filter((e) => audienceOf(e) === filter.audience);
  if (filter.volunteerTypeId) {
    employees = employees.filter((e) => (typesByEmployee.get(e.id) ?? []).includes(filter.volunteerTypeId!));
  }
  if (employees.length === 0) return stats;

  // Only people who already have a checklist.
  const withState = new Set<string>();
  for (const ids of chunk(employees.map((e) => e.id), 100)) {
    const { data, error } = await supabase
      .from('ess_onboarding_states')
      .select('employee_id')
      .eq('company_id', companyId)
      .in('employee_id', ids);
    if (error) throw new Error(`onboarding read failed: ${error.message}`);
    for (const s of (data ?? []) as { employee_id: string }[]) withState.add(s.employee_id);
  }
  const targets = employees.filter((e) => withState.has(e.id));
  if (targets.length === 0) return stats;
  const targetIds = targets.map((e) => e.id);

  // --- Flows -----------------------------------------------------------------
  const [templates, types] = await Promise.all([
    fetchAll<{ id: string; audience: string; is_default: boolean; volunteer_type_id: string | null }>((from, to) =>
      supabase
        .from('ess_onboarding_templates')
        .select('id, audience, is_default, volunteer_type_id')
        .eq('company_id', companyId)
        .order('created_at')
        .range(from, to)
    ),
    fetchAll<{ id: string; name: string; sort_order: number }>((from, to) =>
      supabase.from('ess_volunteer_types').select('id, name, sort_order').eq('company_id', companyId).order('id').range(from, to)
    ),
  ]);
  const templateSteps = await fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from('ess_onboarding_steps')
      .select('template_id, title, description, sort_order, step_type, ref_kind, ref_id, auto_complete, is_required')
      .eq('company_id', companyId)
      .is('employee_id', null)
      .order('template_id')
      .order('sort_order')
      .order('id')
      .range(from, to)
  );
  const stepsByTemplate = new Map<string, FlowStep[]>();
  for (const r of templateSteps) {
    const tid = r.template_id as string | null;
    if (!tid) continue;
    if (!stepsByTemplate.has(tid)) stepsByTemplate.set(tid, []);
    stepsByTemplate.get(tid)!.push(toFlowStep(r));
  }

  const baseTemplates = templates.filter((t) => !t.volunteer_type_id);
  const baseFlowFor = (aud: OnboardingAudience): FlowStep[] => pickBaseFlow(baseTemplates, stepsByTemplate, aud);
  const templateByType = new Map(
    templates.filter((t) => t.volunteer_type_id).map((t) => [t.volunteer_type_id as string, t.id])
  );
  const typeOrder = new Map(
    [...types]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((t, i) => [t.id, i])
  );

  // --- People's current steps + what they already satisfied ------------------
  const allSteps: Array<PersonStep & { employee_id: string }> = [];
  for (const ids of chunk(targetIds, 100)) {
    const rows = await fetchAll<PersonStep & { employee_id: string }>((from, to) =>
      supabase
        .from('ess_onboarding_steps')
        .select('id, employee_id, title, description, status, step_type, ref_id, sort_order, is_required, origin')
        .eq('company_id', companyId)
        .in('employee_id', ids)
        .order('id')
        .range(from, to)
    );
    allSteps.push(...rows);
  }
  const mineByEmp = new Map<string, PersonStep[]>();
  for (const row of allSteps) {
    if (!mineByEmp.has(row.employee_id)) mineByEmp.set(row.employee_id, []);
    mineByEmp.get(row.employee_id)!.push(row);
  }

  const satisfied = await loadSatisfiedArtifacts(companyId, targetIds);

  // --- Plan ------------------------------------------------------------------
  const toInsert: Array<Record<string, unknown>> = [];
  const toDelete: string[] = [];
  const toUpdate: ChecklistPlan['update'] = [];
  const touched = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const emp of targets) {
    const typeFlows = (typesByEmployee.get(emp.id) ?? [])
      .filter((tid) => typeOrder.has(tid))
      .sort((a, b) => (typeOrder.get(a) ?? 0) - (typeOrder.get(b) ?? 0))
      .map((tid) => {
        const tpl = templateByType.get(tid);
        return tpl ? stepsByTemplate.get(tpl) ?? [] : [];
      });
    const wanted = mergeFlowSteps([baseFlowFor(audienceOf(emp)), ...typeFlows]);
    const plan = planChecklistSync(mineByEmp.get(emp.id) ?? [], wanted, (s) =>
      isSatisfied(satisfied, emp.id, s.step_type, s.ref_id)
    );

    for (const ins of plan.insert) {
      toInsert.push({
        company_id: companyId,
        employee_id: emp.id,
        title: ins.title,
        description: ins.description ?? null,
        sort_order: ins.sort_order,
        status: ins.status,
        completed_at: ins.status === 'done' ? nowIso : null,
        step_type: ins.step_type,
        ref_kind: ins.ref_kind ?? null,
        ref_id: ins.ref_id ?? null,
        auto_complete: ins.auto_complete ?? false,
        is_required: ins.is_required,
        origin: 'flow',
      });
      stats.added += 1;
      if (ins.status === 'done') stats.autoCompleted += 1;
    }
    toDelete.push(...plan.remove);
    stats.removed += plan.remove.length;
    toUpdate.push(...plan.update);
    if (plan.insert.length || plan.remove.length || plan.update.length) touched.add(emp.id);
  }

  // --- Bulk writes -----------------------------------------------------------
  const CHUNK = 500;
  for (const rows of chunk(toInsert, CHUNK)) {
    const { error } = await supabase.from('ess_onboarding_steps').insert(rows);
    if (error) throw new Error(`onboarding insert failed: ${error.message}`);
  }
  for (const ids of chunk(toDelete, CHUNK)) {
    const { error } = await supabase.from('ess_onboarding_steps').delete().in('id', ids);
    if (error) throw new Error(`onboarding delete failed: ${error.message}`);
  }
  // Wording/order changes are usually few; apply them in parallel batches.
  for (const batch of chunk(toUpdate, 50)) {
    await Promise.all(
      batch.map((u) =>
        supabase
          .from('ess_onboarding_steps')
          .update({ title: u.title, description: u.description, sort_order: u.sort_order, is_required: u.is_required, updated_at: nowIso })
          .eq('id', u.id)
      )
    );
  }

  stats.people = touched.size;
  // Recompute in parallel batches — serially this is one round trip per person,
  // which dominates the request on a large tenant.
  for (const batch of chunk([...touched], 25)) {
    await Promise.all(batch.map((id) => advanceOnboarding(id)));
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
    for (const ids of chunk(employeeIds, 100)) {
      const [signedRes, ackRes, certRes, trainRes] = await Promise.all([
        supabase.from('ess_signed_documents').select('employee_id, document_id').eq('company_id', companyId).in('employee_id', ids),
        // no company_id column on acknowledgments; employee scoping is sufficient
        supabase.from('ess_document_acknowledgments').select('employee_id, document_id').in('employee_id', ids),
        supabase.from('ess_certifications').select('employee_id, cert_type_id').eq('company_id', companyId).in('employee_id', ids),
        supabase.from('ess_training_progress').select('employee_id, module_id').eq('company_id', companyId).eq('status', 'complete').in('employee_id', ids),
      ]);
      add(signedRes.data as never, 'doc_sign', 'document_id');
      add(ackRes.data as never, 'doc_ack', 'document_id');
      add(certRes.data as never, 'certification', 'cert_type_id');
      add(trainRes.data as never, 'training', 'module_id');
    }
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

/** True when this one person already did the linked artifact of a step. */
export async function isStepSatisfiedFor(
  companyId: string,
  employeeId: string,
  stepType: OnboardingStepType,
  refId: string | null
): Promise<boolean> {
  if (!refId) return false;
  const satisfied = await loadSatisfiedArtifacts(companyId, [employeeId]);
  return isSatisfied(satisfied, employeeId, stepType, refId);
}

/**
 * Initialises an onboarding state row + a checklist for a newly created
 * employee. Idempotent: skips if a state row already exists.
 * The checklist = base flow for the person's audience + their volunteer types'
 * flows (assign types BEFORE calling this). Steps the person already satisfied
 * start done.
 * Published contract — do NOT rename.
 */
export async function initOnboarding(
  employeeId: string,
  companyId: string,
  // Kept for the published signature; the role is read from ess_app_users.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _role?: UserRole
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

  // Best-effort: a sync failure must never block creating the person. The
  // next flow save or type change builds the checklist.
  try {
    await syncOnboardingForPeople(companyId, { employeeIds: [employeeId] });
  } catch (err) {
    console.error('[onboarding] initial checklist sync failed (non-fatal):', (err as Error)?.message);
  }
  await advanceOnboarding(employeeId);
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
  /** Defaults to true (mandatory). */
  is_required?: boolean;
}

/** Derive the ref_kind a step type links to (null for profile/manual). */
export function refKindForStepType(t: OnboardingStepType): 'document' | 'cert_type' | 'training_module' | null {
  if (t === 'doc_sign' || t === 'doc_ack') return 'document';
  if (t === 'certification') return 'cert_type';
  if (t === 'training') return 'training_module';
  return null;
}

/** Get (or lazily create) the base template row for a company + audience. */
export async function ensureTemplate(
  companyId: string,
  audience: OnboardingAudience
): Promise<{ id: string; name: string }> {
  const { data: existing } = await supabaseAdmin
    .from('ess_onboarding_templates')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('audience', audience)
    .is('volunteer_type_id', null)
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

const TEMPLATE_STEP_COLUMNS = 'title, description, sort_order, step_type, ref_kind, ref_id, auto_complete, is_required';

/** Load the ordered steps of one template. */
export async function loadTemplateSteps(companyId: string, templateId: string) {
  const { data: steps } = await supabaseAdmin
    .from('ess_onboarding_steps')
    .select(TEMPLATE_STEP_COLUMNS)
    .eq('company_id', companyId)
    .eq('template_id', templateId)
    .is('employee_id', null)
    .order('sort_order', { ascending: true });
  return steps ?? [];
}

/** Load a base template + its ordered steps for editing. */
export async function loadTemplate(companyId: string, audience: OnboardingAudience) {
  const t = await ensureTemplate(companyId, audience);
  const steps = await loadTemplateSteps(companyId, t.id);
  return { id: t.id, name: t.name, audience, steps };
}

/** Replace one template's steps with the supplied ordered list. */
export async function saveStepsForTemplate(
  companyId: string,
  templateId: string,
  steps: TemplateStepInput[]
): Promise<void> {
  const { error: delErr } = await supabaseAdmin
    .from('ess_onboarding_steps')
    .delete()
    .eq('company_id', companyId)
    .eq('template_id', templateId)
    .is('employee_id', null);
  if (delErr) throw new Error(`save template: ${delErr.message}`);
  if (steps.length === 0) return;
  const { error } = await supabaseAdmin.from('ess_onboarding_steps').insert(
    steps.map((s, i) => ({
      company_id: companyId,
      template_id: templateId,
      employee_id: null,
      title: s.title,
      description: s.description ?? null,
      sort_order: i,
      status: 'pending' as const,
      step_type: s.step_type,
      ref_kind: refKindForStepType(s.step_type),
      ref_id: s.ref_id ?? null,
      auto_complete: s.auto_complete ?? false,
      is_required: s.is_required ?? true,
    }))
  );
  if (error) throw new Error(`save template: ${error.message}`);
}

/** Replace a base template's steps with the supplied ordered list. */
export async function saveTemplateSteps(
  companyId: string,
  audience: OnboardingAudience,
  steps: TemplateStepInput[]
): Promise<void> {
  const t = await ensureTemplate(companyId, audience);
  await saveStepsForTemplate(companyId, t.id, steps);
}

/**
 * Push a base flow onto the people who already exist (everyone in that
 * audience). Kept for callers of the old name; see syncOnboardingForPeople.
 */
export async function syncTemplateToExistingPeople(
  companyId: string,
  audience: OnboardingAudience
): Promise<SyncStats> {
  return syncOnboardingForPeople(companyId, { audience });
}

/** What a step can link to (company-scoped). Shared with the person page. */
export async function loadStepOptions(companyId: string) {
  const [{ data: docs }, { data: certs }, { data: mods }] = await Promise.all([
    supabaseAdmin.from('ess_documents').select('id, title').eq('company_id', companyId).order('title'),
    supabaseAdmin.from('ess_cert_types').select('id, name').eq('company_id', companyId).order('name'),
    supabaseAdmin.from('ess_training_modules').select('id, title').eq('company_id', companyId).eq('status', 'published').order('title'),
  ])
  return {
    documents: (docs ?? []).map((d) => ({ id: d.id as string, title: (d as { title?: string }).title ?? '' })),
    certTypes: (certs ?? []).map((c) => ({ id: c.id as string, name: (c as { name?: string }).name ?? '' })),
    modules: (mods ?? []).map((m) => ({ id: m.id as string, title: (m as { title?: string }).title ?? '' })),
  }
}

/* ================================ Approval ================================ */

type Fail = { ok: false; status: number; error: string };

/**
 * Approve a person whose mandatory steps are all resolved. Recomputes the
 * status first so a stale row can never be approved.
 */
export async function approveOnboarding(
  companyId: string,
  employeeId: string,
  actorAppUserId: string
): Promise<{ ok: true; approvedAt: string } | Fail> {
  const { data: state } = await supabaseAdmin
    .from('ess_onboarding_states')
    .select('id, approved_at')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (!state) return { ok: false, status: 404, error: 'Onboarding not found' };
  if (state.approved_at) return { ok: false, status: 409, error: 'This person is already approved' };

  const status = await advanceOnboarding(employeeId);
  if (status !== 'completed') {
    return { ok: false, status: 409, error: 'Not all mandatory steps are complete' };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('ess_onboarding_states')
    .update({ approved_at: nowIso, approved_by: actorAppUserId, status: 'approved', updated_at: nowIso })
    .eq('company_id', companyId)
    .eq('employee_id', employeeId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, approvedAt: nowIso };
}

/** Take an approval back. The status returns to what the steps say. */
export async function revokeOnboardingApproval(
  companyId: string,
  employeeId: string
): Promise<{ ok: true; status: OnboardingStatus } | Fail> {
  const { data: state } = await supabaseAdmin
    .from('ess_onboarding_states')
    .select('id, approved_at')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (!state) return { ok: false, status: 404, error: 'Onboarding not found' };
  if (!state.approved_at) return { ok: false, status: 409, error: 'This person is not approved' };

  const { error } = await supabaseAdmin
    .from('ess_onboarding_states')
    .update({ approved_at: null, approved_by: null, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('employee_id', employeeId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, status: await advanceOnboarding(employeeId) };
}
