// /api/settings/certificate — the tenant's completion-certificate template (MOS-721).
// GET returns the current template (or the built-in default); PUT saves a NEW
// version. Versions are append-only so issued certificates never change.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'
import { resolveOrgName } from '@/lib/branding'
import {
  CertificateTemplateSchema,
  DEFAULT_CERTIFICATE_TEMPLATE,
  getLatestTemplate,
  saveTemplate,
} from '@/lib/certificates/template'

export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext) => {
    const [latest, orgName, company] = await Promise.all([
      getLatestTemplate(ctx.companyId),
      resolveOrgName(ctx.companyId),
      supabaseAdmin.from('ess_companies').select('settings').eq('id', ctx.companyId).single(),
    ])
    const orgLogoUrl = (company.data?.settings as { logo_url?: string } | null)?.logo_url ?? null
    return NextResponse.json({
      template: latest?.config ?? DEFAULT_CERTIFICATE_TEMPLATE,
      version: latest?.version ?? 0,
      updatedAt: latest?.createdAt ?? null,
      defaults: DEFAULT_CERTIFICATE_TEMPLATE,
      orgName,
      orgLogoUrl,
    })
  },
  { minRole: 'admin' },
)

export const PUT = withAuth(
  async (request: NextRequest, ctx: AuthContext) => {
    const body = await request.json().catch(() => null)
    const parsed = CertificateTemplateSchema.safeParse(body?.template)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return NextResponse.json(
        { error: issue ? `${issue.path.join('.') || 'template'}: ${issue.message}` : 'Invalid template' },
        { status: 400 },
      )
    }
    try {
      const saved = await saveTemplate(ctx.companyId, parsed.data, ctx.appUser.id)
      await recordAudit({
        companyId: ctx.companyId,
        actorId: ctx.appUser.id,
        action: 'settings.certificate_template_updated',
        target: { type: 'company', id: ctx.companyId },
        meta: { version: saved.version },
      })
      return NextResponse.json({ template: saved.config, version: saved.version, updatedAt: saved.createdAt })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 })
    }
  },
  { minRole: 'admin' },
)
