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
