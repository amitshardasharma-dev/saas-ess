// Compliance & certification types (Phase 3). Zod schemas colocated for request
// validation (conventions §6.5).

import { z } from 'zod'
import type { CertStatus } from '@/lib/compliance/expiry'

export interface CertType {
  id: string
  company_id: string
  name: string
  validity_months: number | null
  requires_file: boolean
  required: boolean
  reminder_offsets: number[]
  created_at: string
}

// Admin/HR review lifecycle for a certification (distinct from the expiry-driven
// `status`). pending = legacy/not-yet-submitted; submitted = awaiting review;
// validated = approved; changes_requested = back to the volunteer; rejected.
export type VerificationStatus =
  | 'pending'
  | 'submitted'
  | 'validated'
  | 'rejected'
  | 'changes_requested'

export interface Certification {
  id: string
  company_id: string
  employee_id: string
  cert_type_id: string | null
  title: string
  status: CertStatus | 'pending'
  verification_status: VerificationStatus
  verified_by: string | null
  verified_at: string | null
  completion_date: string | null
  expiry_date: string | null
  file_url: string | null
  file_name: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// A message in a certification's review thread.
export interface CertMessage {
  id: string
  certification_id: string
  author_app_user_id: string | null
  author_kind: 'owner' | 'reviewer' | 'system'
  author_name: string | null
  body: string
  created_at: string
}

/** A certification enriched with derived expiry fields for list/dashboard views. */
export interface CertificationView extends Certification {
  days_until_expiry: number | null
  indicator: 'green' | 'amber' | 'red'
}

export type CertHistoryAction = 'created' | 'renewed' | 'expired' | 'revoked' | 'recertified'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const certTypeCreateSchema = z
  .object({
    name: z.string().min(1),
    // null = never expires; otherwise a positive integer number of months.
    validity_months: z.number().int().positive().nullable().optional(),
    requires_file: z.boolean().optional(),
    required: z.boolean().optional(),
    // days-before-expiry offsets; each a non-negative integer.
    reminder_offsets: z.array(z.number().int().nonnegative()).optional(),
  })
  .strict()

export type CertTypeCreateInput = z.infer<typeof certTypeCreateSchema>

export const certificationCreateSchema = z
  .object({
    employee_id: z.string().uuid(),
    cert_type_id: z.string().uuid().nullable().optional(),
    title: z.string().min(1),
    completion_date: z.string().regex(ISO_DATE).nullable().optional(),
    // Optional explicit expiry; if omitted it is derived from the cert type.
    expiry_date: z.string().regex(ISO_DATE).nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict()

export type CertificationCreateInput = z.infer<typeof certificationCreateSchema>

/**
 * Self-service certification create (the volunteer-facing
 * /api/profile/certifications POST). Deliberately differs from
 * certificationCreateSchema:
 *  - NO employee_id field: identity is forced to ctx.employee.id server-side and
 *    never read from the body.
 *  - cert_type_id is REQUIRED: a volunteer always picks a company-defined type.
 *  - NOT `.strict()`: extra/unexpected keys (e.g. an attempted employee_id in the
 *    body) are silently ignored rather than rejected, which is the security
 *    contract — a body employee_id has no effect.
 */
export const selfCertificationCreateSchema = z.object({
  cert_type_id: z.string().uuid(),
  title: z.string().min(1),
  completion_date: z.string().regex(ISO_DATE).nullable().optional(),
})

export type SelfCertificationCreateInput = z.infer<typeof selfCertificationCreateSchema>

export const certificationUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    completion_date: z.string().regex(ISO_DATE).nullable().optional(),
    expiry_date: z.string().regex(ISO_DATE).nullable().optional(),
    notes: z.string().nullable().optional(),
    // explicit renewal flag; renewal is also inferred when dates change.
    renew: z.boolean().optional(),
  })
  .strict()

export type CertificationUpdateInput = z.infer<typeof certificationUpdateSchema>

/**
 * Reviewer (hr+) decision on a submitted certification. `action` drives the new
 * verification_status; `expiry_date` optionally overrides the expiry as part of
 * the review; `message` is an optional note recorded in the cert thread and sent
 * to the volunteer's inbox.
 */
export const certReviewSchema = z
  .object({
    action: z.enum(['validate', 'reject', 'request_changes']),
    expiry_date: z.string().regex(ISO_DATE).nullable().optional(),
    message: z.string().trim().min(1).max(4000).optional(),
  })
  .strict()

export type CertReviewInput = z.infer<typeof certReviewSchema>

/** A new message in a certification's review thread (owner reply or reviewer note). */
export const certMessageCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
  })
  .strict()

export type CertMessageCreateInput = z.infer<typeof certMessageCreateSchema>
