// /api/training/modules/:id/certificate — a downloadable Certificate of
// Completion (ISS-006). Generated on demand for the signed-in learner, only if
// they have actually completed the module. Cross-tenant / not-completed -> 404/403.
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/lib/auth-middleware'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveOrgName } from '@/lib/branding'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

function fmtDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const GET = withAuth(
  async (_req: NextRequest, ctx: AuthContext, params) => {
    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Module ID required' }, { status: 400 })
    if (!ctx.employee) return NextResponse.json({ error: 'No employee record' }, { status: 403 })

    const { data: mod } = await supabaseAdmin
      .from('ess_training_modules')
      .select('title')
      .eq('id', id)
      .eq('company_id', ctx.companyId)
      .single()
    if (!mod) return NextResponse.json({ error: 'Module not found' }, { status: 404 })

    const { data: prog } = await supabaseAdmin
      .from('ess_training_progress')
      .select('status, completed_at')
      .eq('company_id', ctx.companyId)
      .eq('employee_id', ctx.employee.id)
      .eq('module_id', id)
      .maybeSingle()
    if (!prog || prog.status !== 'complete') {
      return NextResponse.json({ error: 'Complete this training to download your certificate.' }, { status: 403 })
    }

    const org = await resolveOrgName(ctx.companyId)
    const learner = ctx.employee.full_name || 'Volunteer'
    const moduleTitle = (mod as { title?: string }).title ?? 'Training'
    const dateStr = fmtDate((prog as { completed_at?: string | null }).completed_at ?? null)

    // ---- Build the certificate (landscape A4) ----
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([842, 595])
    const { width, height } = page.getSize()
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
    const teal = rgb(0.05, 0.6, 0.53)
    const dark = rgb(0.12, 0.16, 0.23)
    const grey = rgb(0.42, 0.45, 0.5)

    // Border (drawn as lines — a decorative double frame)
    const rectBorder = (x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>, thickness: number) => {
      page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color })
      page.drawLine({ start: { x: x + w, y }, end: { x: x + w, y: y + h }, thickness, color })
      page.drawLine({ start: { x: x + w, y: y + h }, end: { x, y: y + h }, thickness, color })
      page.drawLine({ start: { x, y: y + h }, end: { x, y }, thickness, color })
    }
    rectBorder(24, 24, width - 48, height - 48, teal, 2)
    rectBorder(32, 32, width - 64, height - 64, rgb(0.8, 0.9, 0.88), 1)

    const center = (text: string, y: number, f: typeof font, size: number, color = dark) => {
      const w = f.widthOfTextAtSize(text, size)
      page.drawText(text, { x: (width - w) / 2, y, size, font: f, color })
    }

    center(org.toUpperCase(), height - 90, bold, 18, teal)
    center('Certificate of Completion', height - 150, bold, 34, dark)
    center('This is to certify that', height - 205, italic, 14, grey)
    center(learner, height - 250, bold, 30, dark)
    center('has successfully completed the training module', height - 295, italic, 14, grey)
    center(`“${moduleTitle}”`, height - 335, bold, 22, teal)
    center(`Completed on ${dateStr}`, height - 385, font, 13, grey)

    // Signature line
    const lineY = 130
    page.drawLine({ start: { x: width / 2 - 130, y: lineY }, end: { x: width / 2 + 130, y: lineY }, thickness: 1, color: grey })
    center('Authorised by ' + org, lineY - 18, font, 11, grey)

    const bytes = await pdf.save()
    const safe = moduleTitle.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificate-${safe || 'training'}.pdf"`,
      },
    })
  },
  { minRole: 'employee' },
)
