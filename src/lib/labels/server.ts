// src/lib/labels/server.ts
//
// Server-side terminology resolver. Safe to call from API routes / Server
// Components. Uses supabaseAdmin (service role) and is always tenant-scoped by
// the companyId argument. Falls back to platform defaults on any error.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { ResolvedLabels, makeLabelFn, resolveLabels } from './resolve'

/**
 * Resolve the terminology label map for a company (tenant overrides merged onto
 * platform defaults). Phases 2-7 import this for emails, CSV/PDF exporters, etc.
 */
export async function getLabels(companyId: string): Promise<ResolvedLabels> {
  const { data, error } = await supabaseAdmin
    .from('ess_tenant_labels')
    .select('term_key, singular, plural')
    .eq('company_id', companyId)

  if (error || !data) return resolveLabels([])
  return resolveLabels(data)
}

/** Convenience: resolve labels and return a `t(key, { plural })` accessor. */
export async function getLabelFn(companyId: string) {
  const labels = await getLabels(companyId)
  return makeLabelFn(labels)
}
