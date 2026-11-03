/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }))

import { PDFDocument } from 'pdf-lib'
import { renderCertificatePdf, detectLogoFormat } from '@/lib/certificates/render'
import { DEFAULT_CERTIFICATE_TEMPLATE, normalizeTemplate, CertificateTemplateSchema } from '@/lib/certificates/template'

const data = { orgName: 'Birch Foundation', learnerName: 'Virnie Bagonbon', moduleTitle: 'Volunteer Induction', completedOn: '22 September 2026' }

describe('certificate renderer (MOS-721)', () => {
  it('renders the default layout as a single landscape A4 page', async () => {
    const bytes = await renderCertificatePdf(null, data)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPages()).toHaveLength(1)
    expect(doc.getPages()[0].getSize()).toEqual({ width: 842, height: 595 })
  })

  it('renders a customised template with signatory and footer', async () => {
    const bytes = await renderCertificatePdf(
      { ...DEFAULT_CERTIFICATE_TEMPLATE, title: 'Award', signatoryName: 'Shone Benjamin', signatoryTitle: 'CEO', footer: 'Thank you', accentColor: '#aa0000' },
      data,
    )
    expect(bytes.length).toBeGreaterThan(500)
  })

  it('does not throw on characters the standard fonts cannot encode', async () => {
    await expect(renderCertificatePdf(null, { ...data, learnerName: 'Zoë 李雷 Łukasz' })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('still issues the certificate when the logo cannot be fetched', async () => {
    const orig = global.fetch
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    try {
      await expect(renderCertificatePdf({ ...DEFAULT_CERTIFICATE_TEMPLATE, logoUrl: 'https://example.com/x.png' }, data)).resolves.toBeInstanceOf(Uint8Array)
    } finally {
      global.fetch = orig
    }
  })

  it('detects PNG and JPEG and rejects other formats', () => {
    expect(detectLogoFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png')
    expect(detectLogoFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(detectLogoFormat(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
  })
})

describe('certificate template schema', () => {
  it('fills gaps in a stored config from the defaults', () => {
    expect(normalizeTemplate({ title: 'Custom' })).toEqual({ ...DEFAULT_CERTIFICATE_TEMPLATE, title: 'Custom' })
  })
  it('falls back to the default for a corrupt config', () => {
    expect(normalizeTemplate({ accentColor: 'red' })).toEqual(DEFAULT_CERTIFICATE_TEMPLATE)
  })
  it('rejects unknown keys so dynamic fields cannot be overridden', () => {
    expect(CertificateTemplateSchema.safeParse({ ...DEFAULT_CERTIFICATE_TEMPLATE, learnerName: 'Static' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// MOS-748: flexible layout
// ---------------------------------------------------------------------------
import zlib from 'zlib'
import { isTenantAssetUrl, LAYOUT_DEFAULTS, SIZE_LIMITS } from '@/lib/certificates/template-schema'

/** Minimal valid RGB PNG, for logo/signature fetch mocks. */
function png(w: number, h: number): Uint8Array {
  const table: number[] = []
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const rows: number[] = []; for (let y = 0; y < h; y++) { rows.push(0); for (let x = 0; x < w; x++) rows.push(20, 20, 20) }
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]))
}

describe('flexible certificate renderer (MOS-748)', () => {
  const orig = global.fetch
  afterEach(() => { global.fetch = orig })

  it('renders logo + signature image at custom sizes, serif, without throwing', async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => ({
      ok: true,
      arrayBuffer: async () => (url.includes('signature') ? png(300, 100) : png(64, 64)).buffer,
    })) as unknown as typeof fetch
    const bytes = await renderCertificatePdf(
      {
        ...DEFAULT_CERTIFICATE_TEMPLATE, ...LAYOUT_DEFAULTS, fontFamily: 'serif', logoHeight: 150, titleSize: 60,
        signatoryName: 'SHONE BENJAMIN', signatoryTitle: 'DIRECTOR',
        logoUrl: 'https://x.supabase.co/logo.png', signatureImageUrl: 'https://x.supabase.co/signature.png', signatureHeight: 80,
      },
      data,
    )
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPages()).toHaveLength(1)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('renders every size at its maximum', async () => {
    const max = Object.fromEntries(Object.entries(SIZE_LIMITS).map(([k, v]) => [k, v.max]))
    await expect(renderCertificatePdf({ ...DEFAULT_CERTIFICATE_TEMPLATE, ...LAYOUT_DEFAULTS, ...max }, { ...data, learnerName: 'Zoë 李雷 Łukasz' })).resolves.toBeInstanceOf(Uint8Array)
  })

  it('leaves templates without layoutVersion on the original fixed layout', async () => {
    const a = await renderCertificatePdf({ ...DEFAULT_CERTIFICATE_TEMPLATE, title: 'Award' }, data)
    const b = await renderCertificatePdf({ ...DEFAULT_CERTIFICATE_TEMPLATE, ...LAYOUT_DEFAULTS, title: 'Award' }, data)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })
})

describe('template schema (MOS-748)', () => {
  it('still accepts templates saved before MOS-748', () => {
    const v1 = { body: 'b', intro: 'i', title: 'T', footer: null, logoUrl: null, orgName: null, textColor: '#000000', mutedColor: '#000000', accentColor: '#11d4d1', signatoryName: 'SHONE BENJAMIN', signatoryTitle: 'DIRECTOR' }
    expect(normalizeTemplate(v1)).toEqual({ ...v1 })
    expect(normalizeTemplate(v1).layoutVersion).toBeUndefined()
  })
  it('accepts the new size settings within their limits and rejects outside', () => {
    expect(CertificateTemplateSchema.safeParse({ ...DEFAULT_CERTIFICATE_TEMPLATE, ...LAYOUT_DEFAULTS }).success).toBe(true)
    expect(CertificateTemplateSchema.safeParse({ ...DEFAULT_CERTIFICATE_TEMPLATE, ...LAYOUT_DEFAULTS, logoHeight: 500 }).success).toBe(false)
    expect(CertificateTemplateSchema.safeParse({ ...DEFAULT_CERTIFICATE_TEMPLATE, ...LAYOUT_DEFAULTS, fontFamily: 'comic' }).success).toBe(false)
    expect(CertificateTemplateSchema.safeParse({ ...DEFAULT_CERTIFICATE_TEMPLATE, layoutVersion: 3 }).success).toBe(false)
  })
})

describe('isTenantAssetUrl', () => {
  const base = 'https://bjbqkhhziurvmjwqoitk.supabase.co'
  const co = 'b8802761-3dcf-4707-b572-e0413c53ab23'
  it('accepts this tenant\'s own uploads only', () => {
    expect(isTenantAssetUrl(`${base}/storage/v1/object/public/ess-branding/${co}/logo-1.png`, co, base)).toBe(true)
    expect(isTenantAssetUrl(`${base}/storage/v1/object/public/ess-branding/other-co/logo-1.png`, co, base)).toBe(false)
    expect(isTenantAssetUrl('http://169.254.169.254/latest/meta-data', co, base)).toBe(false)
    expect(isTenantAssetUrl(`https://evil.example/storage/v1/object/public/ess-branding/${co}/x.png`, co, base)).toBe(false)
    expect(isTenantAssetUrl(`${base}/storage/v1/object/public/ess-branding/${co}/../other/x.png`, co, base)).toBe(false)
    expect(isTenantAssetUrl('not a url', co, base)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Issue and expiry dates
// ---------------------------------------------------------------------------
import { addMonthsClamped, certificateDates, certificateDateLine } from '@/lib/certificates/render'
import { validityLabel, VALIDITY_MONTH_OPTIONS } from '@/lib/certificates/template-schema'

describe('certificate issue and expiry dates', () => {
  it('adds months and keeps the day', () => {
    const d = addMonthsClamped(new Date(2026, 10, 3, 12), 12)
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 10, 3])
  })

  it('limits the day to the end of a shorter month', () => {
    const feb = addMonthsClamped(new Date(2027, 0, 31, 12), 1)
    expect([feb.getFullYear(), feb.getMonth(), feb.getDate()]).toEqual([2027, 1, 28])
    const leap = addMonthsClamped(new Date(2028, 1, 29, 12), 12)
    expect([leap.getFullYear(), leap.getMonth(), leap.getDate()]).toEqual([2029, 1, 28])
  })

  it('gives an expiry date only when the template sets a validity period', () => {
    const iso = '2026-11-03T12:00:00Z'
    expect(certificateDates(iso, 12)).toEqual({ completedOn: '3 November 2026', expiresOn: '3 November 2027' })
    expect(certificateDates(iso, 6)).toEqual({ completedOn: '3 November 2026', expiresOn: '3 May 2027' })
    expect(certificateDates(iso, null)).toEqual({ completedOn: '3 November 2026', expiresOn: null })
    expect(certificateDates(iso, undefined).expiresOn).toBeNull()
  })

  it('keeps the original "Completed on" line when there is no expiry', () => {
    expect(certificateDateLine({ completedOn: '3 November 2026' })).toBe('Completed on 3 November 2026')
    expect(certificateDateLine({ completedOn: '3 November 2026', expiresOn: null })).toBe('Completed on 3 November 2026')
    expect(certificateDateLine({ completedOn: '3 November 2026', expiresOn: '3 November 2027' }))
      .toBe('Issue date: 3 November 2026   ·   Expiry date: 3 November 2027')
  })

  it('renders the expiry line on both layouts', async () => {
    const withExpiry = { ...data, expiresOn: '22 September 2027' }
    for (const t of [null, { ...DEFAULT_CERTIFICATE_TEMPLATE, ...LAYOUT_DEFAULTS, fontFamily: 'serif' as const, validityMonths: 12 }]) {
      const bytes = await renderCertificatePdf(t, withExpiry)
      expect((await PDFDocument.load(bytes)).getPages()).toHaveLength(1)
      const plain = await renderCertificatePdf(t, data)
      expect(Buffer.from(bytes).equals(Buffer.from(plain))).toBe(false)
    }
  })

  it('accepts a validity period in whole months between 1 and 120, or null', () => {
    const ok = (v: unknown) => CertificateTemplateSchema.safeParse({ ...DEFAULT_CERTIFICATE_TEMPLATE, validityMonths: v }).success
    expect(ok(12)).toBe(true)
    expect(ok(null)).toBe(true)
    expect(ok(120)).toBe(true)
    expect(ok(0)).toBe(false)
    expect(ok(121)).toBe(false)
    expect(ok(1.5)).toBe(false)
    expect(ok('12')).toBe(false)
    expect(normalizeTemplate({ validityMonths: 12 }).validityMonths).toBe(12)
    // A template saved before this setting has no expiry.
    expect(normalizeTemplate({ title: 'Custom' }).validityMonths).toBeUndefined()
  })

  it('labels the periods offered in settings', () => {
    expect(validityLabel(1)).toBe('1 month')
    expect(validityLabel(6)).toBe('6 months')
    expect(validityLabel(12)).toBe('12 months (1 year)')
    expect(validityLabel(36)).toBe('36 months (3 years)')
    expect(VALIDITY_MONTH_OPTIONS).toContain(12)
  })
})
