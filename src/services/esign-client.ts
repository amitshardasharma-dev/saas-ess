// src/services/esign-client.ts
//
// Client-side fetch wrapper for the Phase 4 e-sign API (mirrors the auth-header
// pattern in src/services/document.ts). Browser-only.

import type { DocumentField, FieldDefinitionInput, SignatureType } from '@/types/esign'

const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null

const authHeaders = (): HeadersInit => {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export interface SignatureStatusReport {
  total: number
  signed_count: number
  employees: Array<{
    id: string
    name: string
    employee_no: string
    department: string | null
    signed: boolean
    signed_at: string | null
    signed_document_id: string | null
  }>
}

export const esignService = {
  async getFields(documentId: string, versionId?: string): Promise<DocumentField[]> {
    const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''
    const res = await fetch(`/api/documents/${documentId}/fields${qs}`, { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.fields || []
  },

  async saveFields(
    documentId: string,
    versionId: string,
    fields: FieldDefinitionInput[]
  ): Promise<DocumentField[]> {
    const res = await fetch(`/api/documents/${documentId}/fields`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ versionId, fields }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to save fields')
    }
    const data = await res.json()
    return data.fields || []
  },

  async sign(
    documentId: string,
    input: {
      versionId: string
      signerName: string
      signatureType: SignatureType
      fieldValues: Record<string, unknown>
      signatureDataUrl?: string
      signingLocation?: string
    }
  ): Promise<{ id: string; content_hash: string }> {
    const res = await fetch(`/api/documents/${documentId}/sign`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to sign')
    }
    const data = await res.json()
    return data.signed_document
  },

  async getSignatureStatus(documentId: string): Promise<SignatureStatusReport> {
    const res = await fetch(`/api/documents/${documentId}/signature-status`, {
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('Failed to fetch signature status')
    return res.json()
  },

  downloadUrl(signedDocumentId: string): string {
    return `/api/signed-documents/${signedDocumentId}/download`
  },
}
