/**
 * @jest-environment node
 */
import { computeOnboardingStatus } from '@/lib/onboarding';

describe('computeOnboardingStatus (state machine)', () => {
  it('returns not_started when there are no steps', () => {
    expect(computeOnboardingStatus([])).toBe('not_started');
  });

  it('returns not_started when steps exist but none are done', () => {
    expect(
      computeOnboardingStatus([{ status: 'pending' }, { status: 'pending' }])
    ).toBe('not_started');
  });

  it('returns in_progress when some but not all steps are done', () => {
    expect(
      computeOnboardingStatus([{ status: 'done' }, { status: 'pending' }])
    ).toBe('in_progress');
  });

  it('returns completed when all steps are done or skipped', () => {
    expect(
      computeOnboardingStatus([{ status: 'done' }, { status: 'skipped' }])
    ).toBe('completed');
  });

  it('returns blocked when the state row is explicitly blocked', () => {
    expect(
      computeOnboardingStatus([{ status: 'done' }, { status: 'pending' }], true)
    ).toBe('blocked');
  });

  it('blocked overrides even when all steps are complete', () => {
    expect(
      computeOnboardingStatus([{ status: 'done' }], true)
    ).toBe('blocked');
  });
});
