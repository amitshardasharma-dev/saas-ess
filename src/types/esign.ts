// src/types/esign.ts
//
// Phase 4 (E-Signatures) shared types + Zod schemas. Mirrors the DB shapes in
// migrations 030-032 and the published contracts (spec §6).

import { z } from 'zod'

export const FIELD_TYPES = ['text', 'date', 'checkbox', 'signature'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const SIGNATURE_TYPES = ['typed', 'drawn'] as const
export type SignatureType = (typeof SIGNATURE_TYPES)[number]

export type EsignEventType = 'field_defined' | 'signing_started' | 'signed' | 'downloaded'

/** A row of ess_document_fields. */
export interface DocumentField {
  id: string
  company_id: string
  document_id: string
  version_id: string
  field_key: string
  label: string
  type: FieldType
  required: boolean
  page: number
  x_ratio: number | null
  y_ratio: number | null
  width_ratio: number | null
  height_ratio: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

/** A row of ess_signed_documents (the published, immutable contract). */
export interface SignedDocument {
  id: string
  company_id: string
  document_id: string
  version_id: string
  employee_id: string
  signer_name: string
  signature_type: SignatureType
  signature_data: string | null
  field_values: Record<string, unknown>
  signed_pdf_url: string
  content_hash: string
  signed_at: string
  signing_location: string | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/** Submitted field values keyed by field_key. */
export type FieldValues = Record<string, unknown>

/** Input shape for defining a single field. */
export interface FieldDefinitionInput {
  fieldKey: string
  label: string
  type: FieldType
  required?: boolean
  page?: number
  xRatio?: number
  yRatio?: number
  widthRatio?: number
  heightRatio?: number
  sortOrder?: number
}

// --- Zod schemas (validated in routes) ---

export const FieldDefinitionSchema = z
  .object({
    fieldKey: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().optional(),
    page: z.number().int().min(1).optional(),
    xRatio: z.number().min(0).max(1).optional(),
    yRatio: z.number().min(0).max(1).optional(),
    widthRatio: z.number().min(0).max(1).optional(),
    heightRatio: z.number().min(0).max(1).optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict()

export const DefineFieldsSchema = z
  .object({
    versionId: z.string().uuid(),
    fields: z.array(FieldDefinitionSchema).max(200),
  })
  .strict()

export const SignSchema = z
  .object({
    versionId: z.string().uuid(),
    signerName: z.string().min(1).max(200),
    signatureType: z.enum(SIGNATURE_TYPES),
    fieldValues: z.record(z.string(), z.unknown()),
    signatureDataUrl: z.string().max(5_000_000).optional(),
    signingLocation: z.string().max(200).optional(),
  })
  .strict()
