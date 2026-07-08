// src/services/document.ts

import { Document, DocumentCategory, DocumentVersion, DocumentWithVersion } from '@/types/document'

const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('ess_access_token') : null

const authHeaders = (): HeadersInit => {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const authHeadersNoContent = (): HeadersInit => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const documentService = {
  async getCategories(): Promise<DocumentCategory[]> {
    const res = await fetch('/api/document-categories', { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.categories || []
  },

  async createCategory(name: string, sortOrder = 0): Promise<DocumentCategory> {
    const res = await fetch('/api/document-categories', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, sort_order: sortOrder }),
    })
    if (!res.ok) throw new Error('Failed to create category')
    const data = await res.json()
    return data.category
  },

  async getDocuments(manage = false): Promise<DocumentWithVersion[]> {
    const url = manage ? '/api/documents?manage=true' : '/api/documents'
    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return data.documents || []
  },

  async getDocument(id: string): Promise<{ document: Document; versions: DocumentVersion[]; acknowledged: boolean; signed?: boolean; signable?: boolean; signedDocumentId?: string | null }> {
    const res = await fetch(`/api/documents/${id}`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch document')
    return res.json()
  },

  async createDocument(data: { title: string; description?: string; category_id?: string; body_markdown?: string | null; access_roles?: string[]; requires_acknowledgment?: boolean }): Promise<Document> {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to create document')
    const result = await res.json()
    return result.document
  },

  async updateDocument(id: string, data: Partial<Document>): Promise<void> {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update document')
  },

  async deleteDocument(id: string): Promise<void> {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('Failed to delete document')
  },

  async uploadVersion(documentId: string, file: File, changelog?: string): Promise<DocumentVersion> {
    const formData = new FormData()
    formData.append('file', file)
    if (changelog) formData.append('changelog', changelog)

    const res = await fetch(`/api/documents/${documentId}/versions`, {
      method: 'POST',
      headers: authHeadersNoContent(),
      body: formData,
    })
    if (!res.ok) throw new Error('Failed to upload version')
    const data = await res.json()
    return data.version
  },

  async acknowledgeDocument(documentId: string): Promise<void> {
    const res = await fetch(`/api/documents/${documentId}/acknowledge`, {
      method: 'POST',
      headers: authHeaders(),
    })
    if (!res.ok) throw new Error('Failed to acknowledge document')
  },

  async getAcknowledgmentReport(documentId: string): Promise<{
    version: number
    total: number
    acknowledged_count: number
    employees: Array<{ id: string; name: string; employee_no: string; department: string; acknowledged: boolean; acknowledged_at: string | null }>
  }> {
    const res = await fetch(`/api/documents/${documentId}/acknowledgments`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch acknowledgment report')
    return res.json()
  },
}
