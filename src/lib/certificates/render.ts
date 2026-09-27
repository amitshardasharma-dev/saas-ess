// MOS-721 — renders a Certificate of Completion (landscape A4) from a template.
// One renderer serves the learner download and the admin preview, so what the
// admin previews is exactly what learners receive.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type RGB } from 'pdf-lib'
import { DEFAULT_CERTIFICATE_TEMPLATE, type CertificateTemplate } from './template'

export interface CertificateData {
  orgName: string
  learnerName: string
  moduleTitle: string
  /** Already formatted, e.g. "22 September 2026". */
  completedOn: string
}

export const LOGO_MAX_BYTES = 1024 * 1024

export function formatCompletionDate(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const safe = Number.isNaN(d.getTime()) ? new Date() : d
  return safe.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Blend a colour toward white (for the inner frame). */
function tint(hex: string, amount: number): RGB {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => (c / 255) * (1 - amount) + amount
  return rgb(mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255))
}

/** Standard fonts are WinAnsi-only; drop characters they can't encode instead of throwing. */
function safeText(font: PDFFont, text: string): string {
  try {
    font.encodeText(text)
    return text
  } catch {
    return Array.from(text)
      .map((ch) => {
        try { font.encodeText(ch); return ch } catch { return '' }
      })
      .join('')
  }
}

export type LogoFormat = 'png' | 'jpg'

/** Sniff PNG / JPEG from magic bytes (the only formats a PDF can embed). */
export function detectLogoFormat(bytes: Uint8Array): LogoFormat | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  return null
}

async function loadLogo(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > LOGO_MAX_BYTES * 2) return null
    const fmt = detectLogoFormat(bytes)
    if (fmt === 'png') return await pdf.embedPng(bytes)
    if (fmt === 'jpg') return await pdf.embedJpg(bytes)
    return null
  } catch {
    // A missing/unreachable logo must never stop a certificate being issued.
    return null
  }
}

export async function renderCertificatePdf(
  template: CertificateTemplate | null,
  data: CertificateData,
): Promise<Uint8Array> {
  const t = template ?? DEFAULT_CERTIFICATE_TEMPLATE
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([842, 595])
  const { width, height } = page.getSize()
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const accent = hexToRgb(t.accentColor)
  const dark = hexToRgb(t.textColor)
  const grey = hexToRgb(t.mutedColor)
  const org = (t.orgName && t.orgName.trim()) || data.orgName

  const rectBorder = (x: number, y: number, w: number, h: number, color: RGB, thickness: number) => {
    page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color })
    page.drawLine({ start: { x: x + w, y }, end: { x: x + w, y: y + h }, thickness, color })
    page.drawLine({ start: { x: x + w, y: y + h }, end: { x, y: y + h }, thickness, color })
    page.drawLine({ start: { x, y: y + h }, end: { x, y }, thickness, color })
  }
  rectBorder(24, 24, width - 48, height - 48, accent, 2)
  rectBorder(32, 32, width - 64, height - 64, tint(t.accentColor, 0.8), 1)

  // Centre a line, shrinking the font (down to 60%) if it would overflow the frame.
  const maxWidth = width - 140
  const center = (raw: string, y: number, f: PDFFont, size: number, color: RGB = dark) => {
    const text = safeText(f, raw)
    if (!text) return
    let s = size
    while (s > size * 0.6 && f.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5
    const w = f.widthOfTextAtSize(text, s)
    page.drawText(text, { x: (width - w) / 2, y, size: s, font: f, color })
  }

  // The logo takes the top band and pushes the text down.
  let offset = 0
  if (t.logoUrl) {
    const logo = await loadLogo(pdf, t.logoUrl)
    if (logo) {
      const boxW = 200
      const boxH = 52
      const scale = Math.min(boxW / logo.width, boxH / logo.height, 1)
      const w = logo.width * scale
      const h = logo.height * scale
      page.drawImage(logo, { x: (width - w) / 2, y: height - 50 - h, width: w, height: h })
      offset = 45
    }
  }

  if (org) center(org.toUpperCase(), height - 90 - offset, bold, 18, accent)
  center(t.title, height - 150 - offset, bold, 34, dark)
  if (t.intro) center(t.intro, height - 205 - offset, italic, 14, grey)
  center(data.learnerName, height - 250 - offset, bold, 30, dark)
  if (t.body) center(t.body, height - 295 - offset, italic, 14, grey)
  center(`“${data.moduleTitle}”`, height - 335 - offset, bold, 22, accent)
  center(`Completed on ${data.completedOn}`, height - 385 - offset, font, 13, grey)

  // Signature area.
  const lineY = 130
  page.drawLine({ start: { x: width / 2 - 130, y: lineY }, end: { x: width / 2 + 130, y: lineY }, thickness: 1, color: grey })
  const footer = (t.footer && t.footer.trim()) || (org ? `Authorised by ${org}` : '')
  if (t.signatoryName) {
    center(t.signatoryName, lineY - 18, bold, 12, dark)
    if (t.signatoryTitle) center(t.signatoryTitle, lineY - 33, font, 11, grey)
    if (footer) center(footer, t.signatoryTitle ? lineY - 55 : lineY - 40, font, 10, grey)
  } else {
    if (t.signatoryTitle) center(t.signatoryTitle, lineY - 18, font, 11, grey)
    if (footer) center(footer, t.signatoryTitle ? lineY - 40 : lineY - 18, font, 11, grey)
  }

  return pdf.save()
}
