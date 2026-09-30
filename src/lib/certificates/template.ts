// MOS-721 — per-tenant completion-certificate template.
//
// The template only controls the surrounding design and wording. The learner's
// name, the module title and the completion date are always drawn by the
// renderer from real data and are not part of the template, so an admin can't
// replace them with static text.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isTenantAssetUrl, normalizeTemplate, type CertificateTemplate } from './template-schema'

// The schema, defaults and limits live in a client-safe module; re-exported
// here so server code keeps a single import.
export * from './template-schema'

export interface StoredTemplate {
  version: number
  config: CertificateTemplate
  createdAt: string
}

/** The newest template version for a tenant, or null if they never saved one. */
export async function getLatestTemplate(companyId: string): Promise<StoredTemplate | null> {
  const { data } = await supabaseAdmin
    .from('ess_certificate_templates')
    .select('version, config, created_at')
    .eq('company_id', companyId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { version: data.version as number, config: normalizeTemplate(data.config), createdAt: data.created_at as string }
}

/**
 * The template in effect at `at` (the completion time): the newest version saved
 * on or before it. Completions that pre-date every saved version keep the
 * built-in default, so historical certificates never change.
 */
export async function getTemplateInEffect(companyId: string, at: string | null): Promise<StoredTemplate | null> {
  if (!at) return getLatestTemplate(companyId)
  try {
    const { data } = await supabaseAdmin
      .from('ess_certificate_templates')
      .select('version, config, created_at')
      .eq('company_id', companyId)
      .lte('created_at', at)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return { version: data.version as number, config: normalizeTemplate(data.config), createdAt: data.created_at as string }
  } catch {
    return null
  }
}

/** Append a new template version (never updates an existing row). */
export async function saveTemplate(companyId: string, config: CertificateTemplate, actorId: string | null): Promise<StoredTemplate> {
  // Retry once on a version race (two admins saving at the same instant).
  for (let attempt = 0; attempt < 2; attempt++) {
    const latest = await getLatestTemplate(companyId)
    const version = (latest?.version ?? 0) + 1
    const { data, error } = await supabaseAdmin
      .from('ess_certificate_templates')
      .insert({ company_id: companyId, version, config, created_by: actorId })
      .select('version, config, created_at')
      .single()
    if (!error && data) {
      return { version: data.version as number, config: normalizeTemplate(data.config), createdAt: data.created_at as string }
    }
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message)
  }
  throw new Error('Could not save the certificate template, please try again')
}

/**
 * Reject logo/signature links that aren't this tenant's own uploads (the
 * renderer fetches them server-side). Returns an error message, or null if OK.
 */
export function templateAssetError(t: CertificateTemplate, companyId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (t.logoUrl && !isTenantAssetUrl(t.logoUrl, companyId, base)) return 'logoUrl: please upload the logo again'
  if (t.signatureImageUrl && !isTenantAssetUrl(t.signatureImageUrl, companyId, base)) return 'signatureImageUrl: please upload the signature again'
  return null
}
