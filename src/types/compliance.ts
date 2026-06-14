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

export interface Certification {
  id: string
  company_id: string
  employee_id: string
  cert_type_id: string | null
  title: string
  status: CertStatus | 'pending'
  completion_date: string | null
  expiry_date: string | null
  file_url: string | null
  file_name: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
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
