// src/types/document.ts

export interface DocumentCategory {
  id: string
  company_id: string
  name: string
  sort_order: number
}

export interface Document {
  id: string
  company_id: string
  category_id: string
  category_name?: string
  title: string
  description: string | null
  current_version: number
  access_roles: string[] // which roles can see it
  is_published: boolean
  requires_acknowledgment: boolean
  published_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface DocumentVersion {
  id: string
  document_id: string
  version_number: number
  file_url: string
  file_name: string
  file_size: number
  uploaded_by: string
  uploaded_at: string
  changelog: string | null
}

export interface DocumentAcknowledgment {
  id: string
  document_id: string
  version_id: string
  employee_id: string
  employee_name?: string
  acknowledged_at: string
}

export interface DocumentWithVersion extends Document {
  latest_version?: DocumentVersion
  acknowledged?: boolean
  /** Latest version has e-sign fields (this document is signed, not just acknowledged). */
  signable?: boolean
  /** The current employee has a signed record for this document. */
  signed?: boolean
  acknowledgment_count?: number
  total_employees?: number
}
