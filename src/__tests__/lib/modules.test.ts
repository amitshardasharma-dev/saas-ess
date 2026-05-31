/**
 * @jest-environment node
 */
// Import the PURE graph logic (no Supabase) to keep this a fast unit test.
// @/lib/modules re-exports the same symbols for runtime callers.
import {
  assertToggleAllowed,
  missingDependenciesForEnable,
  dependentsBlockingDisable,
  validateModuleSet,
  ModuleDependencyError,
} from '@/lib/modules-deps'

describe('module dependency enforcement', () => {
  it('blocks enabling a module whose dependency is disabled', () => {
    const enabled = ['training'] as const
    // quizzes requires training (present) — allowed
    expect(missingDependenciesForEnable('quizzes', enabled)).toEqual([])
    // recertification requires training + compliance (compliance missing)
    expect(missingDependenciesForEnable('recertification', enabled)).toEqual(['compliance'])
    expect(() => assertToggleAllowed('recertification', true, enabled)).toThrow(
      ModuleDependencyError
    )
  })

  it('rejects enabling quizzes without training', () => {
    expect(() => assertToggleAllowed('quizzes', true, [])).toThrow(ModuleDependencyError)
    expect(missingDependenciesForEnable('quizzes', [])).toEqual(['training'])
  })

  it('allows enabling when all dependencies are present', () => {
    expect(() =>
      assertToggleAllowed('recertification', true, ['training', 'compliance'])
    ).not.toThrow()
  })

  it('allows enabling a module with no dependencies', () => {
    expect(() => assertToggleAllowed('training', true, [])).not.toThrow()
  })

  it('blocks disabling training while quizzes is enabled', () => {
    const enabled = ['training', 'quizzes'] as const
    expect(dependentsBlockingDisable('training', enabled)).toContain('quizzes')
    expect(() => assertToggleAllowed('training', false, enabled)).toThrow(ModuleDependencyError)
  })

  it('allows disabling a module with no enabled dependents', () => {
    expect(dependentsBlockingDisable('training', ['training'])).toEqual([])
    expect(() => assertToggleAllowed('training', false, ['training'])).not.toThrow()
  })

  it('validateModuleSet flags an inconsistent set', () => {
    const bad = validateModuleSet(['quizzes']) // missing training
    expect(bad.ok).toBe(false)
    expect(bad.errors.join(' ')).toMatch(/training/)

    const good = validateModuleSet(['training', 'quizzes'])
    expect(good.ok).toBe(true)
    expect(good.errors).toEqual([])
  })
})
