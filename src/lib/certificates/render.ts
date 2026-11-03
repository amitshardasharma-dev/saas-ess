// MOS-721 — renders a Certificate of Completion (landscape A4) from a template.
// One renderer serves the learner download and the admin preview, so what the
// admin previews is exactly what learners receive.
//
// MOS-748 — templates saved with `layoutVersion: 2` use the flexible layout
// (adjustable logo/text sizes, serif option, signature image). Everything else,
// including every template saved before MOS-748, uses the original fixed layout
// below, unchanged, so a template saved before MOS-748 still renders as it did.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type RGB } from 'pdf-lib'
import { DEFAULT_CERTIFICATE_TEMPLATE, resolveLayout, type CertificateTemplate } from './template-schema'
import { planFlexibleLayout, type ColorKey, type FontKey } from './layout'

export interface CertificateData {
  orgName: string
  learnerName: string
  moduleTitle: string
  /** Already formatted, e.g. "22 September 2026". Also the issue date. */
  completedOn: string
  /** Already formatted expiry date, or null/absent if the certificate does not expire. */
  expiresOn?: string | null
}

export const LOGO_MAX_BYTES = 1024 * 1024

function toDate(iso: string | null): Date {
  const d = iso ? new Date(iso) : new Date()
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatCompletionDate(iso: string | null): string {
  return formatDate(toDate(iso))
}

/**
 * Add whole months. The day is kept, but is limited to the last day of the
 * target month (31 January + 1 month = 28 or 29 February).
 */
export function addMonthsClamped(d: Date, months: number): Date {
  const r = new Date(d.getTime())
  const day = r.getDate()
  r.setDate(1)
  r.setMonth(r.getMonth() + months)
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()
  r.setDate(Math.min(day, lastDay))
  return r
}

/**
 * The formatted completion (issue) date and, if the template sets a validity
 * period, the expiry date. null `completedAtIso` = today (used by the preview).
 */
export function certificateDates(
  completedAtIso: string | null,
  validityMonths: number | null | undefined,
): { completedOn: string; expiresOn: string | null } {
  const issued = toDate(completedAtIso)
  return {
    completedOn: formatDate(issued),
    expiresOn: validityMonths ? formatDate(addMonthsClamped(issued, validityMonths)) : null,
  }
}

/** The date line under the module name. Without an expiry it is the original "Completed on" line. */
export function certificateDateLine(data: Pick<CertificateData, 'completedOn' | 'expiresOn'>): string {
  return data.expiresOn
    ? `Issue date: ${data.completedOn}   ·   Expiry date: ${data.expiresOn}`
    : `Completed on ${data.completedOn}`
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
  if (template?.layoutVersion === 2) return renderFlexible(template, data)
  return renderFixed(template ?? DEFAULT_CERTIFICATE_TEMPLATE, data)
}

/**
 * The original fixed layout (MOS-721). Do not change: issued certificates depend
 * on it. The date line only differs when the template sets a validity period.
 */
async function renderFixed(t: CertificateTemplate, data: CertificateData): Promise<Uint8Array> {
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
  center(certificateDateLine(data), height - 385 - offset, font, 13, grey)

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

/** MOS-748 flexible layout: sizes from the template, positions from planFlexibleLayout. */
async function renderFlexible(t: CertificateTemplate, data: CertificateData): Promise<Uint8Array> {
  const L = resolveLayout(t)
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([842, 595])
  const { width, height } = page.getSize()
  const serif = L.fontFamily === 'serif'
  const [regular, bold, italic] = await Promise.all([
    pdf.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica),
    pdf.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold),
    pdf.embedFont(serif ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique),
  ])
  const fonts: Record<FontKey, PDFFont> = { regular, bold, italic }
  const colors: Record<ColorKey, RGB> = { accent: hexToRgb(t.accentColor), dark: hexToRgb(t.textColor), grey: hexToRgb(t.mutedColor) }

  const rectBorder = (x: number, y: number, w: number, h: number, color: RGB, thickness: number) => {
    page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness, color })
    page.drawLine({ start: { x: x + w, y }, end: { x: x + w, y: y + h }, thickness, color })
    page.drawLine({ start: { x: x + w, y: y + h }, end: { x, y: y + h }, thickness, color })
    page.drawLine({ start: { x, y: y + h }, end: { x, y }, thickness, color })
  }
  rectBorder(24, 24, width - 48, height - 48, colors.accent, 2)
  rectBorder(32, 32, width - 64, height - 64, tint(t.accentColor, 0.8), 1)

  const [logo, signature] = await Promise.all([
    t.logoUrl ? loadLogo(pdf, t.logoUrl) : Promise.resolve(null),
    t.signatureImageUrl ? loadLogo(pdf, t.signatureImageUrl) : Promise.resolve(null),
  ])

  // All three faces share WinAnsi encoding, so one sanitising pass covers them.
  const clean = (s: string | null | undefined) => {
    const v = s ? safeText(regular, s).trim() : ''
    return v || null
  }
  const org = clean((t.orgName && t.orgName.trim()) || data.orgName)
  const footer = clean((t.footer && t.footer.trim()) || (org ? `Authorised by ${org}` : ''))

  const plan = planFlexibleLayout({
    page: { width, height },
    metrics: { width: (text, font, size) => fonts[font].widthOfTextAtSize(text, size) },
    layout: L,
    text: {
      org: org ? org.toUpperCase() : null,
      title: clean(t.title) ?? '',
      intro: clean(t.intro),
      name: clean(data.learnerName) ?? '',
      body: clean(t.body),
      module: `“${clean(data.moduleTitle) ?? ''}”`,
      date: certificateDateLine(data),
      signatoryName: clean(t.signatoryName),
      signatoryTitle: clean(t.signatoryTitle),
      footer,
    },
    logo: logo ? { width: logo.width, height: logo.height } : null,
    signature: signature ? { width: signature.width, height: signature.height } : null,
  })

  for (const item of plan) {
    if (item.kind === 'rule') {
      page.drawLine({ start: { x: item.x1, y: item.y }, end: { x: item.x2, y: item.y }, thickness: 1, color: colors.grey })
    } else if (item.kind === 'image') {
      const img = item.key === 'logo' ? logo : signature
      if (img) page.drawImage(img, { x: item.x, y: item.y, width: item.width, height: item.height })
    } else {
      for (const line of item.lines) {
        page.drawText(line.text, { x: line.x, y: line.y, size: item.size, font: fonts[item.font], color: colors[item.color] })
      }
    }
  }

  return pdf.save()
}
