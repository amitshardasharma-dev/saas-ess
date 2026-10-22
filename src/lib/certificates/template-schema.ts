// Certificate template shape, defaults and limits (MOS-721, MOS-748).
//
// Pure module (no server imports) so the settings UI can share the same limits
// and defaults as the API and the renderer.
//
// The template only controls the surrounding design and wording. The learner's
// name, the module title and the completion date are always drawn by the
// renderer from real data and are not part of the template, so an admin can't
// replace them with static text.
import { z } from 'zod'

const HEX = /^#[0-9a-fA-F]{6}$/

/** Slider ranges (pt) for the flexible layout, shared by the API and the UI. */
export const SIZE_LIMITS = {
  logoHeight: { min: 20, max: 180 },
  orgNameSize: { min: 8, max: 40 },
  titleSize: { min: 14, max: 64 },
  nameSize: { min: 14, max: 56 },
  moduleSize: { min: 10, max: 44 },
  textSize: { min: 8, max: 26 },
  signatureTextSize: { min: 8, max: 22 },
  signatureHeight: { min: 16, max: 110 },
} as const

type SizeKey = keyof typeof SIZE_LIMITS

const size = (k: SizeKey) => z.number().min(SIZE_LIMITS[k].min).max(SIZE_LIMITS[k].max)

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

    // --- MOS-748: flexible layout -----------------------------------------
    // Absent on templates saved before MOS-748, which keep the original fixed
    // layout so they still render exactly as the admin designed them.
    layoutVersion: z.literal(2).optional(),
    fontFamily: z.enum(['sans', 'serif']).optional(),
    logoHeight: size('logoHeight').optional(),
    orgNameSize: size('orgNameSize').optional(),
    titleSize: size('titleSize').optional(),
    nameSize: size('nameSize').optional(),
    moduleSize: size('moduleSize').optional(),
    textSize: size('textSize').optional(),
    signatureTextSize: size('signatureTextSize').optional(),
    /** Public URL of a PNG/JPEG signature image (e.g. the Director's), or null. */
    signatureImageUrl: z.string().url().max(1000).nullable().optional(),
    signatureHeight: size('signatureHeight').optional(),
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

export interface ResolvedLayout {
  layoutVersion: 2
  fontFamily: 'sans' | 'serif'
  logoHeight: number
  orgNameSize: number
  titleSize: number
  nameSize: number
  moduleSize: number
  textSize: number
  signatureTextSize: number
  signatureHeight: number
}

/** Flexible-layout settings; the sizes match the original fixed layout. */
export const LAYOUT_DEFAULTS: ResolvedLayout = {
  layoutVersion: 2,
  fontFamily: 'sans',
  logoHeight: 52,
  orgNameSize: 18,
  titleSize: 34,
  nameSize: 30,
  moduleSize: 22,
  textSize: 14,
  signatureTextSize: 12,
  signatureHeight: 44,
}

/** The flexible-layout settings of a template, with defaults filled in. */
export function resolveLayout(t: CertificateTemplate): ResolvedLayout {
  return {
    layoutVersion: 2,
    fontFamily: t.fontFamily ?? LAYOUT_DEFAULTS.fontFamily,
    logoHeight: t.logoHeight ?? LAYOUT_DEFAULTS.logoHeight,
    orgNameSize: t.orgNameSize ?? LAYOUT_DEFAULTS.orgNameSize,
    titleSize: t.titleSize ?? LAYOUT_DEFAULTS.titleSize,
    nameSize: t.nameSize ?? LAYOUT_DEFAULTS.nameSize,
    moduleSize: t.moduleSize ?? LAYOUT_DEFAULTS.moduleSize,
    textSize: t.textSize ?? LAYOUT_DEFAULTS.textSize,
    signatureTextSize: t.signatureTextSize ?? LAYOUT_DEFAULTS.signatureTextSize,
    signatureHeight: t.signatureHeight ?? LAYOUT_DEFAULTS.signatureHeight,
  }
}

/** Merge a stored config over the defaults so older/partial rows still render. */
export function normalizeTemplate(raw: unknown): CertificateTemplate {
  const merged = { ...DEFAULT_CERTIFICATE_TEMPLATE, ...((raw && typeof raw === 'object') ? raw : {}) }
  const parsed = CertificateTemplateSchema.safeParse(merged)
  return parsed.success ? parsed.data : DEFAULT_CERTIFICATE_TEMPLATE
}

/**
 * Logo and signature images must be files this tenant uploaded to the
 * `ess-branding` bucket. The renderer fetches them server-side, so an arbitrary
 * URL would let an admin make the server request any address.
 */
export function isTenantAssetUrl(url: string, companyId: string, supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false
  try {
    const u = new URL(url)
    const base = new URL(supabaseUrl)
    return (
      u.protocol === 'https:' &&
      u.host === base.host &&
      u.pathname.startsWith(`/storage/v1/object/public/ess-branding/${companyId}/`) &&
      !u.pathname.includes('..')
    )
  } catch {
    return false
  }
}
