// src/types/esign.ts
//
// Phase 4 (E-Signatures) shared types + Zod schemas. Mirrors the DB shapes in
// migrations 030-032 and the published contracts (spec §6).

import { z } from 'zod'

export const FIELD_TYPES = ['text', 'date', 'checkbox', 'signature'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

// Semantic hint used for the designer palette + profile auto-fill on signing.
// `type` is still the input/embed type; `kind` is an orthogonal label/prefill hint.
export const FIELD_KINDS = [
  'custom',
  'full_name',
  'first_name',
  'last_name',
  'email',
  'phone',
  'address',
  'employee_no',
  'dob',
  'date',
  'number',
  'id_number',
] as const
export type FieldKind = (typeof FIELD_KINDS)[number]

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
  kind: FieldKind
  required: boolean
  page: number
  x_ratio: number | null
  y_ratio: number | null
  width_ratio: number | null
  height_ratio: number | null
  sort_order: number
  /** MOS-720: which signer fills this field (role key). Absent/'recipient' = the document's recipient. */
  signer_role?: string
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
  kind?: FieldKind
  required?: boolean
  page?: number
  xRatio?: number
  yRatio?: number
  widthRatio?: number
  heightRatio?: number
  sortOrder?: number
  signerRole?: string
}

// --- Signing order (MOS-720) ---

/** The role filled by whoever the document is for (volunteer / employee). */
export const RECIPIENT_ROLE = 'recipient'

export type SignerAssignee = { type: 'recipient' } | { type: 'employee'; employeeId: string; name?: string | null }

export interface SignerRole {
  /** Stable key referenced by ess_document_fields.signer_role. */
  key: string
  /** Shown to signers and admins, e.g. "Authorised Officer". */
  label: string
  assignee: SignerAssignee
  /** Named signer signs once; their signature applies to every recipient's copy. */
  signOnce?: boolean
}

/** Stored on ess_document_versions.signing_config. Array order = signing order. */
export interface SigningConfig {
  roles: SignerRole[]
}

export const SignerRoleSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]{1,40}$/),
    label: z.string().trim().min(1).max(60),
    assignee: z.discriminatedUnion('type', [
      z.object({ type: z.literal('recipient') }).strict(),
      z.object({ type: z.literal('employee'), employeeId: z.string().uuid(), name: z.string().max(200).nullable().optional() }).strict(),
    ]),
    signOnce: z.boolean().optional(),
  })
  .strict()

export const SigningConfigSchema = z
  .object({ roles: z.array(SignerRoleSchema).min(1).max(8) })
  .strict()
  .superRefine((cfg, ctx) => {
    const keys = new Set<string>()
    let recipients = 0
    cfg.roles.forEach((r, i) => {
      if (keys.has(r.key)) ctx.addIssue({ code: 'custom', message: `Duplicate signer "${r.label}"`, path: ['roles', i, 'key'] })
      keys.add(r.key)
      if (r.assignee.type === 'recipient') {
        recipients++
        if (r.key !== RECIPIENT_ROLE) ctx.addIssue({ code: 'custom', message: 'The recipient signer must use the key "recipient"', path: ['roles', i, 'key'] })
        if (r.signOnce) ctx.addIssue({ code: 'custom', message: 'The recipient signs their own copy', path: ['roles', i, 'signOnce'] })
      }
    })
    if (recipients !== 1) ctx.addIssue({ code: 'custom', message: 'Exactly one signer must be the person receiving the document', path: ['roles'] })
  })

// --- Zod schemas (validated in routes) ---

export const FieldDefinitionSchema = z
  .object({
    fieldKey: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    type: z.enum(FIELD_TYPES),
    kind: z.enum(FIELD_KINDS).optional(),
    required: z.boolean().optional(),
    page: z.number().int().min(1).optional(),
    xRatio: z.number().min(0).max(1).optional(),
    yRatio: z.number().min(0).max(1).optional(),
    widthRatio: z.number().min(0).max(1).optional(),
    heightRatio: z.number().min(0).max(1).optional(),
    sortOrder: z.number().int().optional(),
    signerRole: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  })
  .strict()

export const DefineFieldsSchema = z
  .object({
    versionId: z.string().uuid(),
    fields: z.array(FieldDefinitionSchema).max(200),
    /** MOS-720: omitted = leave the version's signing order untouched; null = single signer. */
    signingConfig: SigningConfigSchema.nullable().optional(),
    /** Confirms cancelling copies that are part-way through signing. */
    restart: z.boolean().optional(),
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
    /** MOS-720: whose copy is being signed (defaults to the caller); 'shared' = a sign-once sheet. */
    recipientEmployeeId: z.union([z.string().uuid(), z.literal('shared')]).optional(),
  })
  .strict()
