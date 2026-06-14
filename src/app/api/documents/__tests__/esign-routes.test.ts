/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

// --- mock the foundation + service deps ---
jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { auth: { getUser: jest.fn() }, from: jest.fn() },
}))
jest.mock('@/lib/modules', () => {
  const actual = jest.requireActual('@/lib/modules')
  return { ...actual, assertModuleEnabled: jest.fn() }
})
jest.mock('@/services/esign', () => {
  const actual = jest.requireActual('@/services/esign')
  return {
    __esModule: true,
    FieldValidationError: actual.FieldValidationError,
    SigningError: actual.SigningError,
    getVersionForCompany: jest.fn(),
    listFields: jest.fn(),
    defineFields: jest.fn(),
    listSignedDocuments: jest.fn(),
    createSignedDocument: jest.fn(),
    createSignedDownloadUrl: jest.fn(),
  }
})

import { supabaseAdmin } from '@/lib/supabase-admin'
import { assertModuleEnabled, ModuleDisabledError } from '@/lib/modules'
import {
  getVersionForCompany,
  defineFields,
  createSignedDocument,
  createSignedDownloadUrl,
  FieldValidationError,
} from '@/services/esign'

import { POST as fieldsPOST } from '@/app/api/documents/[id]/fields/route'
import { POST as signPOST } from '@/app/api/documents/[id]/sign/route'
import { GET as downloadGET } from '@/app/api/signed-documents/[id]/download/route'

const mockGetUser = (supabaseAdmin.auth.getUser as unknown) as jest.Mock
const mockModule = assertModuleEnabled as jest.Mock
const mockGetVersion = getVersionForCompany as jest.Mock
const mockDefineFields = defineFields as jest.Mock
const mockCreateSigned = createSignedDocument as jest.Mock
const mockDownloadUrl = createSignedDownloadUrl as jest.Mock

const UUID = '11111111-1111-1111-1111-111111111111'

/** Make supabaseAdmin.from return app_user (role) then employee, for withAuth. */
function authAs(role: string, companyId = 'c1') {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'x@y.z' } }, error: null })
  let n = 0
  ;(supabaseAdmin.from as jest.Mock).mockImplementation(() => {
    n++
    const single =
      n === 1
        ? { data: { id: 'au1', company_id: companyId, role, is_active: true }, error: null }
        : { data: { id: 'emp1', full_name: 'Vol', employee_no: 'V1' }, error: null }
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(single),
    }
  })
}

function req(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer t', 'content-type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  jest.clearAllMocks()
  mockModule.mockResolvedValue(undefined)
})

describe('module gating', () => {
  it('POST fields -> 404 when documents_esign disabled', async () => {
    authAs('hr')
    mockModule.mockRejectedValue(new ModuleDisabledError('documents_esign'))
    const res = await fieldsPOST(
      req(`http://localhost/api/documents/${UUID}/fields`, { versionId: UUID, fields: [] }),
      ctxOf(UUID)
    )
    expect(res.status).toBe(404)
  })
})

describe('role gating', () => {
  it('POST fields rejects a volunteer (employee) — requires hr+', async () => {
    authAs('employee')
    const res = await fieldsPOST(
      req(`http://localhost/api/documents/${UUID}/fields`, { versionId: UUID, fields: [] }),
      ctxOf(UUID)
    )
    expect(res.status).toBe(403)
    expect(mockDefineFields).not.toHaveBeenCalled()
  })

  it('POST fields allows hr and calls the service', async () => {
    authAs('hr')
    mockGetVersion.mockResolvedValue({ versionId: UUID, documentId: UUID, companyId: 'c1', fileUrl: 'u', fileName: 'f' })
    mockDefineFields.mockResolvedValue([])
    const res = await fieldsPOST(
      req(`http://localhost/api/documents/${UUID}/fields`, {
        versionId: UUID,
        fields: [{ fieldKey: 'name', label: 'Name', type: 'text' }],
      }),
      ctxOf(UUID)
    )
    expect(res.status).toBe(201)
    expect(mockDefineFields).toHaveBeenCalled()
  })
})

describe('tenant isolation', () => {
  it('POST fields -> 404 when version not in caller company', async () => {
    authAs('hr', 'companyB')
    mockGetVersion.mockResolvedValue(null) // cross-tenant / missing
    const res = await fieldsPOST(
      req(`http://localhost/api/documents/${UUID}/fields`, { versionId: UUID, fields: [] }),
      ctxOf(UUID)
    )
    expect(res.status).toBe(404)
  })

  it('GET download -> 404 for a cross-tenant signed doc', async () => {
    authAs('hr', 'companyB')
    mockDownloadUrl.mockResolvedValue(null) // ownership re-check fails
    const res = await downloadGET(
      req(`http://localhost/api/signed-documents/${UUID}/download`),
      ctxOf(UUID)
    )
    expect(res.status).toBe(404)
  })
})

describe('signing route', () => {
  it('400s on invalid body', async () => {
    authAs('employee')
    const res = await signPOST(
      req(`http://localhost/api/documents/${UUID}/sign`, { versionId: 'not-a-uuid' }),
      ctxOf(UUID)
    )
    expect(res.status).toBe(400)
  })

  it('400s when the service raises a field validation error', async () => {
    authAs('employee')
    mockGetVersion.mockResolvedValue({ versionId: UUID, documentId: UUID, companyId: 'c1', fileUrl: 'u', fileName: 'f' })
    mockCreateSigned.mockRejectedValue(new FieldValidationError('Field "Name" is required', 'name'))
    const res = await signPOST(
      req(`http://localhost/api/documents/${UUID}/sign`, {
        versionId: UUID,
        signerName: 'Jane',
        signatureType: 'typed',
        fieldValues: {},
      }),
      ctxOf(UUID)
    )
    expect(res.status).toBe(400)
  })

  it('captures IP + user-agent and returns the signed id', async () => {
    authAs('employee')
    mockGetVersion.mockResolvedValue({ versionId: UUID, documentId: UUID, companyId: 'c1', fileUrl: 'u', fileName: 'f' })
    mockCreateSigned.mockResolvedValue({ id: 'sd1', content_hash: 'abc' })
    const res = await signPOST(
      req(
        `http://localhost/api/documents/${UUID}/sign`,
        { versionId: UUID, signerName: 'Jane', signatureType: 'typed', fieldValues: { name: 'Jane' } },
        { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'JestAgent/1.0' }
      ),
      ctxOf(UUID)
    )
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.signed_document.id).toBe('sd1')
    const arg = mockCreateSigned.mock.calls[0][0]
    expect(arg.ipAddress).toBe('203.0.113.7')
    expect(arg.userAgent).toBe('JestAgent/1.0')
    expect(arg.employeeId).toBe('emp1')
  })
})
