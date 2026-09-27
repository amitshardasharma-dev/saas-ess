// MOS-721 — per-tenant completion-certificate template.
//
// The template only controls the surrounding design and wording. The learner's
// name, the module title and the completion date are always drawn by the
// renderer from real data and are not part of the template, so an admin can't
// replace them with static text.
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-admin'

const HEX = /^#[0-9a-fA-F]{6}$/

export const CertificateTemplateSchema = z
  .object({
    /** Organisation name printed at the top. null = the tenant's brand name. */
    orgName: z.string().trim().max(80).nullable().optional(),
    title: z.string().trim().min(1).max(60),
    intro: z.string().trim().max(120),
    body: z.string().trim().max(160),
    /** Line under the signature rule. null = "Authorised by <org>". */
    footer: z.string().trim().max(120).nullable().optional(),
    signatoryName: z.string().trim().max(80).nullable().optional(),
    signatoryTitle: z.string().trim().max(80).nullable().optional(),
    /** Public URL of a PNG/JPEG logo, or null for no logo. */
    logoUrl: z.string().url().max(1000).nullable().optional(),
    accentColor: z.string().regex(HEX, 'Use a #RRGGBB colour'),
    textColor: z.string().regex(HEX, 'Use a #RRGGBB colour'),
    mutedColor: z.string().regex(HEX, 'Use a #RRGGBB colour'),
  })
  .strict()

export type CertificateTemplate = z.infer<typeof CertificateTemplateSchema>

/** Reproduces the certificate as it looked before templates existed. */
export const DEFAULT_CERTIFICATE_TEMPLATE: CertificateTemplate = {
  orgName: null,
  title: 'Certificate of Completion',
  intro: 'This is to certify that',
  body: 'has successfully completed the training module',
  footer: null,
  signatoryName: null,
  signatoryTitle: null,
  logoUrl: null,
  accentColor: '#0d9987',
  textColor: '#1f293b',
  mutedColor: '#6b7380',
}

export interface StoredTemplate {
  version: number
  config: CertificateTemplate
  createdAt: string
}

/** Merge a stored config over the defaults so older/partial rows still render. */
export function normalizeTemplate(raw: unknown): CertificateTemplate {
  const merged = { ...DEFAULT_CERTIFICATE_TEMPLATE, ...((raw && typeof raw === 'object') ? raw : {}) }
  const parsed = CertificateTemplateSchema.safeParse(merged)
  return parsed.success ? parsed.data : DEFAULT_CERTIFICATE_TEMPLATE
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
