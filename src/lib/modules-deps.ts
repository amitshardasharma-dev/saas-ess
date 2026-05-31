// src/lib/modules-deps.ts
//
// Pure module dependency-graph logic — NO I/O, NO Supabase import — so it can be
// unit-tested and imported from client code without pulling in server modules.
// `@/lib/modules` re-exports these alongside the DB-backed helpers.

import { MODULE_DEPENDENCIES, MODULE_IDS, ModuleId } from '@/types/roles'

export class ModuleDependencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModuleDependencyError'
  }
}

/**
 * Dependencies of `moduleId` that are not present in `enabled`
 * (i.e. why it cannot be enabled yet). Empty array means OK to enable.
 */
export function missingDependenciesForEnable(
  moduleId: ModuleId,
  enabled: Iterable<ModuleId>
): ModuleId[] {
  const set = new Set(enabled)
  const deps = MODULE_DEPENDENCIES[moduleId] ?? []
  return deps.filter(dep => !set.has(dep))
}

/**
 * Enabled modules that still depend on `moduleId`
 * (i.e. why it cannot be disabled). Empty array means OK to disable.
 */
export function dependentsBlockingDisable(
  moduleId: ModuleId,
  enabled: Iterable<ModuleId>
): ModuleId[] {
  const set = new Set(enabled)
  return MODULE_IDS.filter(
    id =>
      id !== moduleId &&
      set.has(id) &&
      (MODULE_DEPENDENCIES[id] ?? []).includes(moduleId)
  )
}

/**
 * Validate a single toggle against the current enabled set + dependency graph.
 * Throws ModuleDependencyError with a clear message if the toggle is illegal.
 */
export function assertToggleAllowed(
  moduleId: ModuleId,
  nextEnabled: boolean,
  enabled: Iterable<ModuleId>
): void {
  if (nextEnabled) {
    const missing = missingDependenciesForEnable(moduleId, enabled)
    if (missing.length > 0) {
      throw new ModuleDependencyError(
        `Cannot enable "${moduleId}": requires ${missing.join(', ')}`
      )
    }
  } else {
    const dependents = dependentsBlockingDisable(moduleId, enabled)
    if (dependents.length > 0) {
      throw new ModuleDependencyError(
        `Cannot disable "${moduleId}": required by ${dependents.join(', ')}`
      )
    }
  }
}

/**
 * Validate a full desired enabled-set is internally consistent: every enabled
 * module has all its dependencies enabled too. Returns the offending pairs.
 */
export function validateModuleSet(desired: Iterable<ModuleId>): {
  ok: boolean
  errors: string[]
} {
  const set = new Set(desired)
  const errors: string[] = []
  for (const id of set) {
    const missing = (MODULE_DEPENDENCIES[id] ?? []).filter(dep => !set.has(dep))
    if (missing.length > 0) {
      errors.push(`"${id}" requires ${missing.join(', ')}`)
    }
  }
  return { ok: errors.length === 0, errors }
}
