// src/lib/modules.ts
//
// Module access enforcement (Phase 1 published contract).
//
// A module is usable for a tenant only when present in
// ess_companies.settings.modules_enabled (a JSON string array). The pure
// dependency-graph logic lives in '@/lib/modules-deps' (no Supabase import, so
// it is client- and test-safe) and is re-exported here for convenience.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { MODULE_IDS, ModuleId } from '@/types/roles'

export {
  ModuleDependencyError,
  assertToggleAllowed,
  validateModuleSet,
  missingDependenciesForEnable,
  dependentsBlockingDisable,
} from '@/lib/modules-deps'

const DEFAULT_MODULES: ModuleId[] = ['leave', 'expense']

export class ModuleDisabledError extends Error {
  constructor(public readonly moduleId: string) {
    super(`Module not enabled: ${moduleId}`)
    this.name = 'ModuleDisabledError'
  }
}

/**
 * Fetch the enabled module ids for a company from settings.modules_enabled,
 * filtered to known ids. Returns DEFAULT_MODULES when unset.
 */
export async function getEnabledModules(companyId: string): Promise<ModuleId[]> {
  // maybeSingle (not single) so a transient/empty read returns null instead of
  // throwing; and we distinguish "row not found / query error" from "row found
  // but no modules_enabled set". Only the latter falls back to DEFAULT_MODULES.
  const { data: company, error } = await supabaseAdmin
    .from('ess_companies')
    .select('settings')
    .eq('id', companyId)
    .maybeSingle()

  // On a query error we cannot trust the result — surface it rather than
  // silently stripping every tenant module (which produced spurious 403s).
  if (error) {
    throw new Error(`getEnabledModules: failed to read company ${companyId}: ${error.message}`)
  }

  const settings = company?.settings as Record<string, unknown> | null
  const raw = settings?.modules_enabled

  if (Array.isArray(raw)) {
    return raw.filter((m): m is ModuleId => MODULE_IDS.includes(m as ModuleId))
  }
  return DEFAULT_MODULES
}

/**
 * Assert a module is enabled for a company. Throws ModuleDisabledError if not.
 * Use in module-gated route handlers (translate the throw to a 403).
 */
export async function assertModuleEnabled(
  companyId: string,
  moduleId: ModuleId
): Promise<void> {
  const enabled = await getEnabledModules(companyId)
  if (!enabled.includes(moduleId)) {
    throw new ModuleDisabledError(moduleId)
  }
}
