/**
 * @jest-environment node
 */
import {
  validateFieldValues,
  computeContentHash,
  defineFields,
  listFields,
  getSignedDocument,
  createSignedDownloadUrl,
  renderSignedPdf,
  storagePathFromUrl,
  FieldValidationError,
} from '@/services/esign'
import type { DocumentField } from '@/types/esign'

// --- mock the foundation deps ---
jest.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: { from: jest.fn(), storage: { from: jest.fn() } },
}))
jest.mock('@/lib/audit', () => ({ recordAudit: jest.fn() }))

// Deterministic pdf-lib mock (the real, uninstalled lib).
jest.mock(
  'pdf-lib',
  () => {
    const page = {
      getSize: () => ({ width: 600, height: 800 }),
      drawText: jest.fn(),
      drawImage: jest.fn(),
    }
    return {
      __esModule: true,
      rgb: () => ({ type: 'RGB' }),
      StandardFonts: { Helvetica: 'Helvetica' },
      PDFDocument: {
        load: async () => ({
          getPages: () => [page],
          embedFont: async () => ({ widthOfTextAtSize: () => 10 }),
          embedPng: async () => ({ width: 10, height: 10 }),
          save: async () => new Uint8Array([1, 2, 3, 4]),
        }),
      },
    }
  },
  { virtual: true }
)

import { supabaseAdmin } from '@/lib/supabase-server'

type Result = { data: unknown; error: unknown }

/** A thenable query-builder stub whose terminal value is `result`. */
function chainFor(result: Result) {
  const chain: Record<string, jest.Mock> & { then?: unknown } = {}
  for (const m of ['select', 'insert', 'delete', 'eq', 'order', 'limit']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.maybeSingle = jest.fn(() => Promise.resolve(result))
  chain.single = jest.fn(() => Promise.resolve(result))
  chain.then = (resolve: (v: Result) => void) => resolve(result)
  return chain
}

function field(p: Partial<DocumentField>): DocumentField {
  return {
    id: 'f1',
    company_id: 'c1',
    document_id: 'd1',
    version_id: 'v1',
    field_key: 'name',
    label: 'Name',
    type: 'text',
    required: true,
    page: 1,
    x_ratio: 0.1,
    y_ratio: 0.1,
    width_ratio: 0.2,
    height_ratio: 0.05,
    sort_order: 0,
    created_at: 'now',
    updated_at: 'now',
    ...p,
  }
}

const mockFrom = supabaseAdmin.from as jest.Mock
const mockStorageFrom = supabaseAdmin.storage.from as jest.Mock

afterEach(() => jest.clearAllMocks())

describe('validateFieldValues', () => {
  it('blocks submission when a required field is missing', () => {
    const fields = [field({ field_key: 'name', label: 'Name', required: true })]
    expect(() => validateFieldValues(fields, {})).toThrow(FieldValidationError)
    expect(() => validateFieldValues(fields, { name: 'Jane' })).not.toThrow()
  })

  it('allows missing optional fields', () => {
    expect(() => validateFieldValues([field({ required: false })], {})).not.toThrow()
  })

  it('validates date / checkbox / signature types', () => {
    expect(() =>
      validateFieldValues([field({ field_key: 'd', type: 'date' })], { d: 'nope' })
    ).toThrow(/valid date/i)
    expect(() =>
      validateFieldValues([field({ field_key: 'c', type: 'checkbox' })], { c: 'yes' })
    ).toThrow(/checkbox/i)
    expect(() =>
      validateFieldValues([field({ field_key: 's', type: 'signature' })], { s: '' })
    ).toThrow(/required/i)
    expect(() =>
      validateFieldValues([field({ field_key: 's', type: 'signature' })], { s: 'Jane' })
    ).not.toThrow()
  })
})

describe('computeContentHash', () => {
  it('is a stable sha256 of the bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const expected = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a'
    expect(computeContentHash(bytes)).toBe(expected)
    expect(computeContentHash(bytes)).toBe(computeContentHash(new Uint8Array([1, 2, 3, 4])))
  })

  it('changes when the bytes change', () => {
    expect(computeContentHash(new Uint8Array([1, 2, 3, 4]))).not.toBe(
      computeContentHash(new Uint8Array([1, 2, 3, 5]))
    )
  })
})

describe('renderSignedPdf', () => {
  it('produces deterministic bytes via pdf-lib', async () => {
    const out = await renderSignedPdf(
      new Uint8Array([9]),
      [field({ field_key: 't', type: 'text' })],
      { t: 'hello' },
      { signerName: 'Jane', signedAt: '2026-01-01T00:00:00Z' }
    )
    expect(out).toEqual(new Uint8Array([1, 2, 3, 4]))
  })
})

describe('storagePathFromUrl', () => {
  it('extracts the object path from a public URL', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/ess-documents/c1/documents/d1/v1/file.pdf'
    expect(storagePathFromUrl(url, 'ess-documents')).toBe('c1/documents/d1/v1/file.pdf')
  })
  it('returns a bare path unchanged', () => {
    expect(storagePathFromUrl('c1/documents/d1/v1/file.pdf', 'ess-documents')).toBe(
      'c1/documents/d1/v1/file.pdf'
    )
  })
})

describe('defineFields', () => {
  it('clears then inserts and returns rows', async () => {
    const rows = [{ id: 'f1', field_key: 'name' }]
    // delete chain, then insert chain
    mockFrom.mockReturnValueOnce(chainFor({ data: null, error: null }))
    mockFrom.mockReturnValueOnce(chainFor({ data: rows, error: null }))
    // recordEsignEvent insert (event log) — third from()
    mockFrom.mockReturnValueOnce(chainFor({ data: null, error: null }))

    const result = await defineFields(
      'c1',
      'actor1',
      { versionId: 'v1', documentId: 'd1', companyId: 'c1', fileUrl: 'u', fileName: 'f' },
      [{ fieldKey: 'name', label: 'Name', type: 'text' }]
    )
    expect(mockFrom).toHaveBeenCalledWith('ess_document_fields')
    expect(result).toEqual(rows)
  })
})

describe('listFields', () => {
  it('scopes by company + version ordered by sort_order', async () => {
    const chain = chainFor({ data: [{ id: 'f1' }], error: null })
    mockFrom.mockReturnValue(chain)
    await listFields('c1', 'v1')
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'c1')
    expect(chain.eq).toHaveBeenCalledWith('version_id', 'v1')
    expect(chain.order).toHaveBeenCalledWith('sort_order', { ascending: true })
  })
})

describe('tenant isolation', () => {
  it('getSignedDocument returns null for a doc not in the company', async () => {
    const chain = chainFor({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    const result = await getSignedDocument('companyB', 'sd-from-A')
    expect(chain.eq).toHaveBeenCalledWith('company_id', 'companyB')
    expect(result).toBeNull()
  })

  it('createSignedDownloadUrl returns null (=> 404) when ownership check fails', async () => {
    // getSignedDocument -> null (not in company)
    mockFrom.mockReturnValue(chainFor({ data: null, error: null }))
    const result = await createSignedDownloadUrl('companyB', 'sd-from-A', 'actor')
    expect(result).toBeNull()
    // never reached storage
    expect(mockStorageFrom).not.toHaveBeenCalled()
  })
})

describe('immutability of ess_signed_documents', () => {
  // Migration 031 grants only SELECT + INSERT (no UPDATE/DELETE). The service
  // also exposes no update/delete path for signed documents.
  it('service module has no update/delete export for signed documents', async () => {
    const esign = await import('@/services/esign')
    const keys = Object.keys(esign)
    expect(keys.some((k) => /updateSigned/i.test(k))).toBe(false)
    expect(keys.some((k) => /deleteSigned/i.test(k))).toBe(false)
  })
})
