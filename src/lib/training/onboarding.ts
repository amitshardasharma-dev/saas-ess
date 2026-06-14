// src/lib/training/onboarding.ts
//
// Cross-phase hooks fired when a module reaches 100%. Onboarding (Phase 2) is
// now in-repo, so the onboarding hook imports it statically; recertification may
// still be absent, so that one stays a guarded dynamic import. Each call is
// wrapped in try/catch so a hook failure never breaks training completion.

import { advanceOnboarding, completeLinkedOnboardingStep } from '@/lib/onboarding'

/**
 * Notify Phase 2 onboarding that the employee finished a module. Phase 2
 * publishes `advanceOnboarding(employeeId)` from '@/lib/onboarding'. That module
 * does not exist in the Phase 5 worktree, so the import is resolved lazily and
 * any failure (missing module, throw) is swallowed.
 */
export async function tryAdvanceOnboarding(employeeId: string, moduleId?: string): Promise<void> {
  try {
    // Prefer the typed/linked completion (training step -> this module). It
    // recomputes status internally when it flips a step.
    let completed = false
    if (moduleId) {
      completed = await completeLinkedOnboardingStep(employeeId, { stepType: 'training', refId: moduleId })
    }
    // No linked step (or no moduleId) — still recompute the rollup.
    if (!completed) {
      await advanceOnboarding(employeeId)
    }
  } catch (err) {
    console.warn('[training] advanceOnboarding hook skipped:', (err as Error)?.message)
  }
}

/**
 * Notify Phase 3/7 recertification that a module (which may back a
 * certification) completed. Optional; guarded identically.
 */
export async function tryRecertHook(employeeId: string, moduleId: string): Promise<void> {
  try {
    const specifier = '@/lib/recertification'
    const mod = (await import(/* webpackIgnore: true */ specifier).catch(() => null)) as
      | { onTrainingModuleComplete?: (employeeId: string, moduleId: string) => Promise<void> | void }
      | null
    if (mod && typeof mod.onTrainingModuleComplete === 'function') {
      await mod.onTrainingModuleComplete(employeeId, moduleId)
    }
  } catch (err) {
    console.warn('[training] recertification hook skipped:', (err as Error)?.message)
  }
}
