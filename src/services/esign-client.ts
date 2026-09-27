// src/services/esign-client.ts
//
// Client-side fetch wrapper for the Phase 4 e-sign API (mirrors the auth-header
// pattern in src/services/document.ts). Browser-only.

import type { DocumentField, FieldDefinitionInput, SignatureType, SigningConfig } from '@/types/esign'
import type { SigningState, QueueItem, CopyProgress } from '@/services/signing-sequence'

export type { SigningState, QueueItem, CopyProgress }

/** Thrown when saving would restart copies that are part-way signed (MOS-720). */
export class SigningInProgressError extends Error {
  started: number
  constructor(message: string, started: number) {
    super(message)
    this.name = 'SigningInProgressError'
    this.started = started
  }
}

export interface SignerOption {
  id: string
  name: string
  designation: string | null
  role: string
  staff: boolean
}

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
    /** MOS-720: present when the document has a signing order. */
    sequence?: CopyProgress | null
  }>
  version_id?: string
  signing_order?: Array<{ order: number; key: string; label: string; sign_once: boolean }>
}

export const esignService = {
  async getFields(documentId: string, versionId?: string): Promise<DocumentField[]> {
    const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''
    const res = await fetch(`/api/documents/${documentId}/fields${qs}`, { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.fields || []
  },

  /** Fields plus the version's signing order (null = single signer). */
  async getFieldsAndOrder(documentId: string, versionId?: string): Promise<{ fields: DocumentField[]; signingConfig: SigningConfig | null }> {
    const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''
    const res = await fetch(`/api/documents/${documentId}/fields${qs}`, { headers: authHeaders() })
    if (!res.ok) return { fields: [], signingConfig: null }
    const data = await res.json()
    return { fields: data.fields || [], signingConfig: data.signing_config ?? null }
  },

  async saveFields(
    documentId: string,
    versionId: string,
    fields: FieldDefinitionInput[],
    order?: { signingConfig: SigningConfig | null; restart?: boolean }
  ): Promise<DocumentField[]> {
    const res = await fetch(`/api/documents/${documentId}/fields`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(order ? { versionId, fields, signingConfig: order.signingConfig, restart: order.restart || undefined } : { versionId, fields }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (res.status === 409 && err.code === 'SIGNING_IN_PROGRESS') throw new SigningInProgressError(err.error, err.started ?? 0)
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
      recipientEmployeeId?: string
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

  /** MOS-720: sign one step of a document that has a signing order. */
  async signStep(
    documentId: string,
    input: {
      versionId: string
      signerName: string
      signatureType: SignatureType
      fieldValues: Record<string, unknown>
      signatureDataUrl?: string
      signingLocation?: string
      recipientEmployeeId?: string
    }
  ): Promise<{ status: 'in_progress' | 'completed'; signedDocumentId: string | null; next: { label: string; name: string | null } | null }> {
    const res = await fetch(`/api/documents/${documentId}/sign`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(input) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to sign')
    if (data.step) return { status: data.step.status, signedDocumentId: data.step.signedDocumentId, next: data.step.next }
    return { status: 'completed', signedDocumentId: data.signed_document?.id ?? null, next: null }
  },

  async getSigningState(documentId: string, versionId: string, recipient?: string | null): Promise<SigningState | { multi: false } | null> {
    const qs = new URLSearchParams({ versionId })
    if (recipient) qs.set('recipient', recipient)
    const res = await fetch(`/api/documents/${documentId}/signing?${qs}`, { headers: authHeaders() })
    if (!res.ok) return null
    return res.json()
  },

  async getSigningQueue(): Promise<QueueItem[]> {
    const res = await fetch('/api/signing/queue', { headers: authHeaders() })
    if (!res.ok) return []
    return (await res.json()).items || []
  },

  async getSignerOptions(): Promise<SignerOption[]> {
    const res = await fetch('/api/signing/signers', { headers: authHeaders() })
    if (!res.ok) return []
    return (await res.json()).people || []
  },

  async restartCopy(documentId: string, versionId: string, recipientEmployeeId: string): Promise<void> {
    const res = await fetch(`/api/documents/${documentId}/signing/restart`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ versionId, recipientEmployeeId, confirm: true }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to restart signing')
    }
  },

  /**
   * Make a document signable (hr+). `source: 'markdown'` renders the authored
   * body to a PDF, uploads it as a new version, and fields it; `source: 'file'`
   * fields the latest uploaded PDF version. Returns the target version id.
   */
  async setupSignature(documentId: string, source: 'markdown' | 'file'): Promise<{ versionId: string }> {
    const res = await fetch(`/api/documents/${documentId}/signature-setup`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ source }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to enable signing')
    }
    return res.json()
  },

  async getSignatureStatus(documentId: string): Promise<SignatureStatusReport> {
    const res = await fetch(`/api/documents/${documentId}/signature-status`, {
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('Failed to fetch signature status')
    return res.json()
  },

  /** Send an inbox reminder to everyone who hasn't signed. Returns the count. */
  async remindUnsigned(documentId: string): Promise<{ reminded: number; non_signers: number }> {
    const res = await fetch(`/api/documents/${documentId}/remind-unsigned`, { method: 'POST', headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to send reminders')
    return res.json()
  },

  /** Remind everyone who hasn't completed the doc (sign or acknowledge). */
  async remindPending(documentId: string): Promise<{ reminded: number; pending: number; mode: string }> {
    const res = await fetch(`/api/documents/${documentId}/remind`, { method: 'POST', headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to send reminders')
    return res.json()
  },

  downloadUrl(signedDocumentId: string): string {
    return `/api/signed-documents/${signedDocumentId}/download`
  },

  /**
   * Open a SIGNED copy (the PDF with the embedded signature) in a new tab. Same
   * popup-safe pattern as openDocumentFile: the signed-documents download route
   * returns a short-lived signed URL, not the file bytes.
   */
  async openSignedDocument(signedDocumentId: string): Promise<void> {
    const win = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
    try {
      const res = await fetch(`/api/signed-documents/${signedDocumentId}/download`, { headers: authHeaders() })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Could not open the signed copy')
      if (win) win.location.href = data.url as string
      else window.open(data.url as string, '_blank', 'noopener,noreferrer')
    } catch (err) {
      if (win) win.close()
      throw err
    }
  },

  /**
   * Open a document's source file. A version's `file_url` is a STORAGE PATH, not
   * a URL — using it directly as a link 404s. This fetches a short-lived signed
   * URL (auth-checked) and opens it. Throws on failure so callers can toast.
   *
   * The blank tab is opened SYNCHRONOUSLY (on the click) and navigated once the
   * URL resolves — opening after the await would trip popup blockers.
   */
  async openDocumentFile(documentId: string, versionId?: string): Promise<void> {
    const win = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
    try {
      const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''
      const res = await fetch(`/api/documents/${documentId}/view-url${qs}`, { headers: authHeaders() })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Could not open the document')
      if (win) win.location.href = data.url as string
      else window.open(data.url as string, '_blank', 'noopener,noreferrer')
    } catch (err) {
      if (win) win.close()
      throw err
    }
  },
}
