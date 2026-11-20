/**
 * @jest-environment node
 */

// Pure parts of the onboarding engine: status rules with mandatory/optional
// steps and approval, joining several flows, and the checklist diff.
jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import {
  computeOnboardingStatus,
  mergeFlowSteps,
  pickBaseFlow,
  planChecklistSync,
  starterFlowSteps,
  stepKey,
  type FlowStep,
  type PersonStep,
} from '@/lib/onboarding';

const flow = (title: string, extra: Partial<FlowStep> = {}): FlowStep => ({
  title,
  description: null,
  step_type: 'manual',
  ref_kind: null,
  ref_id: null,
  auto_complete: false,
  is_required: true,
  ...extra,
});

let n = 0;
const mine = (title: string, extra: Partial<PersonStep> = {}): PersonStep => ({
  id: `s${++n}`,
  title,
  description: null,
  status: 'pending',
  step_type: 'manual',
  ref_id: null,
  sort_order: 0,
  is_required: true,
  origin: 'flow',
  ...extra,
});

describe('computeOnboardingStatus with mandatory steps and approval', () => {
  it('optional open steps do not hold a person back', () => {
    expect(
      computeOnboardingStatus([
        { status: 'done', is_required: true },
        { status: 'pending', is_required: false },
      ]),
    ).toBe('completed');
  });

  it('an open mandatory step keeps the person in progress', () => {
    expect(
      computeOnboardingStatus([
        { status: 'done', is_required: false },
        { status: 'pending', is_required: true },
      ]),
    ).toBe('in_progress');
  });

  it('a step marked not needed (skipped) counts as resolved', () => {
    expect(computeOnboardingStatus([{ status: 'skipped', is_required: true }, { status: 'done' }])).toBe('completed');
  });

  it('approved when approved and every mandatory step is resolved', () => {
    expect(computeOnboardingStatus([{ status: 'done' }], false, true)).toBe('approved');
  });

  it('an approved person with a NEW open mandatory step shows in progress', () => {
    expect(computeOnboardingStatus([{ status: 'done' }, { status: 'pending' }], false, true)).toBe('in_progress');
  });

  it('blocked wins over approved', () => {
    expect(computeOnboardingStatus([{ status: 'done' }], true, true)).toBe('blocked');
  });

  it('steps without is_required (legacy rows) are mandatory', () => {
    expect(computeOnboardingStatus([{ status: 'done' }, { status: 'pending' }])).toBe('in_progress');
  });
});

describe('stepKey', () => {
  it('uses the linked item when there is one', () => {
    expect(stepKey({ step_type: 'doc_sign', ref_id: 'abc', title: 'Anything' })).toBe('doc_sign::abc');
  });
  it('uses the title (case and spaces ignored) for unlinked steps', () => {
    expect(stepKey({ step_type: 'manual', ref_id: null, title: ' Meet the Team ' })).toBe(stepKey({ step_type: 'manual', ref_id: null, title: 'meet the team' }));
  });
});

describe('mergeFlowSteps', () => {
  it('shows a step that is in two flows one time, at its first position', () => {
    const base = [flow('Profile', { step_type: 'profile_field' }), flow('Handbook', { step_type: 'doc_ack', ref_id: 'h' })];
    const opShop = [flow('Manual handling', { step_type: 'training', ref_id: 'mh' }), flow('Handbook again', { step_type: 'doc_ack', ref_id: 'h' })];
    const events = [flow('First aid', { step_type: 'certification', ref_id: 'fa' }), flow('Manual handling', { step_type: 'training', ref_id: 'mh' })];
    const out = mergeFlowSteps([base, opShop, events]);
    expect(out.map((s) => s.title)).toEqual(['Profile', 'Handbook', 'Manual handling', 'First aid']);
  });

  it('a duplicate step is mandatory if any flow says so', () => {
    const out = mergeFlowSteps([
      [flow('Police check', { step_type: 'certification', ref_id: 'pc', is_required: false })],
      [flow('Police check', { step_type: 'certification', ref_id: 'pc', is_required: true })],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].is_required).toBe(true);
  });

  it('does not change the input flows', () => {
    const a = [flow('X', { is_required: false })];
    mergeFlowSteps([a, [flow('X', { is_required: true })]]);
    expect(a[0].is_required).toBe(false);
  });
});

describe('planChecklistSync', () => {
  const never = () => false;

  it('adds missing steps, done at once when already satisfied', () => {
    const plan = planChecklistSync(
      [],
      [flow('Sign agreement', { step_type: 'doc_sign', ref_id: 'd1' }), flow('Meet team')],
      (s) => s.ref_id === 'd1',
    );
    expect(plan.insert.map((s) => [s.title, s.status, s.sort_order])).toEqual([
      ['Sign agreement', 'done', 0],
      ['Meet team', 'pending', 1],
    ]);
  });

  it('removes open flow steps no flow wants, but never a done step', () => {
    const open = mine('Old open step');
    const done = mine('Old done step', { status: 'done' });
    const plan = planChecklistSync([open, done], [], never);
    expect(plan.remove).toEqual([open.id]);
  });

  it('never removes or changes a personal step', () => {
    const personal = mine('WWCC', { origin: 'personal', sort_order: 1001 });
    const plan = planChecklistSync([personal], [], never);
    expect(plan.remove).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it('keeps a step marked not needed (it is in the flow, so it is not added again)', () => {
    const waived = mine('Manual handling', { step_type: 'training', ref_id: 'mh', status: 'skipped' });
    const plan = planChecklistSync([waived], [flow('Manual handling', { step_type: 'training', ref_id: 'mh' })], never);
    expect(plan.insert).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('removes a step marked not needed when no flow wants it any more', () => {
    const waived = mine('Manual handling', { step_type: 'training', ref_id: 'mh', status: 'skipped' });
    expect(planChecklistSync([waived], [], never).remove).toEqual([waived.id]);
  });

  it('updates wording, order and the mandatory flag of matching flow steps', () => {
    const e = mine('Meet team', { sort_order: 3, is_required: true });
    const plan = planChecklistSync([e], [flow('Meet team', { description: 'New text', is_required: false })], never);
    expect(plan.update).toEqual([{ id: e.id, title: 'Meet team', description: 'New text', sort_order: 0, is_required: false }]);
  });

  it('a type change: keeps done steps, adds the new type steps, removes open old-type steps', () => {
    const base = [flow('Profile', { step_type: 'profile_field' })];
    const opShopStep = mine('Manual handling', { step_type: 'training', ref_id: 'mh' });
    const opShopDone = mine('Cash policy', { step_type: 'doc_ack', ref_id: 'cash', status: 'done' });
    const profile = mine('Profile', { step_type: 'profile_field', status: 'done' });
    const events = [flow('First aid', { step_type: 'certification', ref_id: 'fa' })];
    const plan = planChecklistSync([profile, opShopStep, opShopDone], mergeFlowSteps([base, events]), never);
    expect(plan.insert.map((s) => s.title)).toEqual(['First aid']);
    expect(plan.remove).toEqual([opShopStep.id]);
  });
});

describe('pickBaseFlow (base flow for an audience)', () => {
  const tpl = (id: string, audience: string, is_default = false) => ({ id, audience, is_default });
  const steps = new Map<string, FlowStep[]>([
    ['vol', [flow('Volunteer step')]],
    ['staff-empty', []],
  ]);

  it('uses the audience template when it has steps', () => {
    expect(pickBaseFlow([tpl('vol', 'volunteer', true)], steps, 'volunteer').map((s) => s.title)).toEqual(['Volunteer step']);
  });

  it('falls back to the default template when the audience has no template', () => {
    expect(pickBaseFlow([tpl('vol', 'volunteer', true)], steps, 'staff').map((s) => s.title)).toEqual(['Volunteer step']);
  });

  it('an EMPTY template gives the starter steps, not an empty checklist', () => {
    const out = pickBaseFlow([tpl('vol', 'volunteer', true), tpl('staff-empty', 'staff')], steps, 'staff');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toEqual(starterFlowSteps());
  });

  it('no templates at all gives the starter steps', () => {
    expect(pickBaseFlow([], steps, 'volunteer')).toEqual(starterFlowSteps());
  });
});
