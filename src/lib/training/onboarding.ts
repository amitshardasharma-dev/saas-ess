// src/lib/training/onboarding.ts
//
// Cross-phase hooks fired when a module reaches 100%. Phase 2 (onboarding) and
// Phase 3/7 (recertification) own these; they may NOT exist in this worktree.
// Each call is wrapped in try/catch and a dynamic import so a missing module
// never breaks training completion (conventions §5: depend on the contract,
// guard the runtime).

/**
 * Notify Phase 2 onboarding that the employee finished a module. Phase 2
 * publishes `advanceOnboarding(employeeId)` from '@/lib/onboarding'. That module
 * does not exist in the Phase 5 worktree, so the import is resolved lazily and
 * any failure (missing module, throw) is swallowed.
 */
export async function tryAdvanceOnboarding(employeeId: string): Promise<void> {
  try {
    // Use a computed specifier so the bundler/tsc does not hard-require the
    // (not-yet-existing) Phase 2 module at build time.
    const specifier = '@/lib/onboarding'
    const mod = (await import(/* webpackIgnore: true */ specifier).catch(() => null)) as
      | { advanceOnboarding?: (employeeId: string) => Promise<void> | void }
      | null
    if (mod && typeof mod.advanceOnboarding === 'function') {
      await mod.advanceOnboarding(employeeId)
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
