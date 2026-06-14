/**
 * @jest-environment node
 *
 * Task E — proof that the training-complete → recert-close hook is WIRED.
 *
 * The original tryRecertHook dynamic-imported '@/lib/recertification' looking for
 * `onTrainingModuleComplete` (wrong name, and dynamic alias imports silently no-op
 * under turbopack), so finishing a refresher never closed the recert. The fix is a
 * STATIC import of the real `completeRecertForModule(companyId, employeeId, moduleId)`.
 *
 * We mock '@/lib/recertification' (the new index barrel) and assert tryRecertHook
 * resolves it and forwards the exact (companyId, employeeId, moduleId) tuple.
 */
const completeRecertForModule = jest.fn().mockResolvedValue(true)
jest.mock('@/lib/recertification', () => ({
  completeRecertForModule: (...args: unknown[]) => completeRecertForModule(...args),
}))

// onboarding is the other static import in the module under test — stub it out.
jest.mock('@/lib/onboarding', () => ({
  advanceOnboarding: jest.fn().mockResolvedValue(undefined),
  completeLinkedOnboardingStep: jest.fn().mockResolvedValue(false),
}))

import { tryRecertHook } from '@/lib/training/onboarding'

const COMPANY = 'company-1'
const EMP = 'emp-1'
const MODULE = 'mod-1'

describe('tryRecertHook wiring', () => {
  beforeEach(() => completeRecertForModule.mockClear())

  it('calls the real completeRecertForModule with (companyId, employeeId, moduleId)', async () => {
    await tryRecertHook(COMPANY, EMP, MODULE)
    expect(completeRecertForModule).toHaveBeenCalledTimes(1)
    expect(completeRecertForModule).toHaveBeenCalledWith(COMPANY, EMP, MODULE)
  })

  it('is guarded: a thrown recert error never propagates out of the hook', async () => {
    completeRecertForModule.mockRejectedValueOnce(new Error('db down'))
    await expect(tryRecertHook(COMPANY, EMP, MODULE)).resolves.toBeUndefined()
  })

  it('no longer references the dead onTrainingModuleComplete export', async () => {
    // The barrel mock has no onTrainingModuleComplete; if the hook still looked for
    // it, the call below would be a no-op and the spy would never fire.
    await tryRecertHook(COMPANY, EMP, MODULE)
    expect(completeRecertForModule).toHaveBeenCalled()
  })
})
