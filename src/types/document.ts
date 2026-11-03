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
  /** In-app authored content (markdown), rendered inline when present. */
  body_markdown?: string | null
  current_version: number
  access_roles: string[] // which roles can see it
  is_published: boolean
  requires_acknowledgment: boolean
  published_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/** Default audience for a new document: every role. */
export const ALL_DOCUMENT_ROLES = ['employee', 'staff', 'manager', 'hr', 'admin']

/**
 * Can a person with `role` see a document with these access_roles?
 * Documents saved before the `staff` role existed (2026-11) list 'manager' as
 * the lowest staff role, so `staff` also matches any document open to managers.
 * A missing list means the document is open to everyone.
 */
export function documentVisibleTo(accessRoles: string[] | null | undefined, role: string): boolean {
  const roles = accessRoles ?? ALL_DOCUMENT_ROLES
  if (roles.includes(role)) return true
  return role === 'staff' && roles.includes('manager')
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
