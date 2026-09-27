// /api/settings/certificate/preview — renders an unsaved template with sample
// data through the same renderer learners get (MOS-721).
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { resolveOrgName } from '@/lib/branding'
import { CertificateTemplateSchema } from '@/lib/certificates/template'
import { renderCertificatePdf, formatCompletionDate } from '@/lib/certificates/render'

export const POST = withAuth(
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
    const bytes = await renderCertificatePdf(parsed.data, {
      orgName: await resolveOrgName(ctx.companyId),
      learnerName: 'Alex Sample',
      moduleTitle: 'Sample Training Module',
      completedOn: formatCompletionDate(null),
    })
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="certificate-preview.pdf"' },
    })
  },
  { minRole: 'admin' },
)
