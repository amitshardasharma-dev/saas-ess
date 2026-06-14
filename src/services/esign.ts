// src/services/esign.ts
//
// Server-side e-signature service (Phase 4). All DB access goes through the
// service-role client (`supabaseAdmin`), which BYPASSES RLS — so every query
// here MUST scope by company_id at the app layer (see _SHARED_CONVENTIONS §6).
//
// This module is the single home for the signing operation: validation, signed-
// PDF rendering (pdf-lib), sha256 hashing, private-bucket storage, the immutable
// ess_signed_documents insert, the append-only ess_esign_events log, and the
// best-effort Phase 2 onboarding hook.

import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'
import { completeLinkedOnboardingStep } from '@/lib/onboarding'
import type {
  DocumentField,
  FieldDefinitionInput,
  FieldType,
  FieldValues,
  SignedDocument,
  EsignEventType,
} from '@/types/esign'

export const SIGNED_DOCUMENTS_BUCKET = 'signed-documents'
export const SOURCE_DOCUMENTS_BUCKET = 'ess-documents'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class FieldValidationError extends Error {
  field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = 'FieldValidationError'
    this.field = field
  }
}

export class SigningError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'SigningError'
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Parent-scoped version lookup (versions have no company_id; the parent does)
// ---------------------------------------------------------------------------

export interface VersionContext {
  versionId: string
  documentId: string
  companyId: string
  fileUrl: string
  fileName: string
}

/**
 * Resolve a document version and verify it belongs to `companyId` by joining
 * through ess_documents. Returns null when the version does not exist OR belongs
 * to another tenant (callers translate null -> 404, never revealing existence).
 */
export async function getVersionForCompany(
  companyId: string,
  versionId: string
): Promise<VersionContext | null> {
  const { data: version } = await supabaseAdmin
    .from('ess_document_versions')
    .select('id, document_id, file_url, file_name')
    .eq('id', versionId)
    .single()
  if (!version) return null

  const { data: doc } = await supabaseAdmin
    .from('ess_documents')
    .select('id, company_id')
    .eq('id', version.document_id)
    .single()
  if (!doc || doc.company_id !== companyId) return null

  return {
    versionId: version.id,
    documentId: version.document_id,
    companyId: doc.company_id,
    fileUrl: version.file_url,
    fileName: version.file_name,
  }
}

// ---------------------------------------------------------------------------
// E-sign event log (append-only). Best-effort: never breaks the caller.
// ---------------------------------------------------------------------------

export async function recordEsignEvent(input: {
  companyId: string
  event: EsignEventType
  actor?: string | null
  signedDocumentId?: string | null
  documentId?: string | null
  versionId?: string | null
  ip?: string | null
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('ess_esign_events').insert({
      company_id: input.companyId,
      event: input.event,
      actor: input.actor ?? null,
      signed_document_id: input.signedDocumentId ?? null,
      document_id: input.documentId ?? null,
      version_id: input.versionId ?? null,
      ip: input.ip ?? null,
      meta: input.meta ?? {},
    })
    if (error) console.error('[esign] failed to record event', input.event, error.message)
  } catch (err) {
    console.error('[esign] unexpected error recording event', input.event, err)
  }
}

// ---------------------------------------------------------------------------
// Field designer (hr+)
// ---------------------------------------------------------------------------

/**
 * Replace the field set for a document version (delete + insert = idempotent
 * "save"). Records a `field_defined` event and a global audit entry. company_id
 * scoping + role gating are enforced by the calling route.
 */
export async function defineFields(
  companyId: string,
  actorId: string,
  ctx: VersionContext,
  fields: FieldDefinitionInput[]
): Promise<DocumentField[]> {
  await supabaseAdmin
    .from('ess_document_fields')
    .delete()
    .eq('company_id', companyId)
    .eq('version_id', ctx.versionId)

  let inserted: DocumentField[] = []
  if (fields.length > 0) {
    const rows = fields.map((f, index) => ({
      company_id: companyId,
      document_id: ctx.documentId,
      version_id: ctx.versionId,
      field_key: f.fieldKey,
      label: f.label,
      type: f.type,
      required: f.required ?? true,
      page: f.page ?? 1,
      x_ratio: f.xRatio ?? null,
      y_ratio: f.yRatio ?? null,
      width_ratio: f.widthRatio ?? null,
      height_ratio: f.heightRatio ?? null,
      sort_order: f.sortOrder ?? index,
    }))
    const { data, error } = await supabaseAdmin
      .from('ess_document_fields')
      .insert(rows)
      .select('*')
    if (error) throw new Error(`Failed to define fields: ${error.message}`)
    inserted = (data ?? []) as DocumentField[]
  }

  await recordEsignEvent({
    companyId,
    event: 'field_defined',
    actor: actorId,
    documentId: ctx.documentId,
    versionId: ctx.versionId,
    meta: { count: inserted.length },
  })
  await recordAudit({
    companyId,
    actorId,
    action: 'esign.fields_defined',
    target: { type: 'document_version', id: ctx.versionId },
    meta: { count: inserted.length },
  })

  return inserted
}

export async function listFields(
  companyId: string,
  versionId: string
): Promise<DocumentField[]> {
  const { data, error } = await supabaseAdmin
    .from('ess_document_fields')
    .select('*')
    .eq('company_id', companyId)
    .eq('version_id', versionId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`Failed to list fields: ${error.message}`)
  return (data ?? []) as DocumentField[]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Server-side validation of submitted values (keyed by field_key) against the
 * defined fields:
 *  - every required field must have a non-empty value
 *  - date values must parse to a valid date
 *  - checkbox values must be boolean
 *  - signature values must be present (true OR a non-empty string)
 */
export function validateFieldValues(fields: DocumentField[], values: FieldValues): void {
  for (const field of fields) {
    const raw = values[field.field_key]
    const present = raw !== undefined && raw !== null && raw !== ''

    if (field.required && !present) {
      throw new FieldValidationError(`Field "${field.label}" is required`, field.field_key)
    }
    if (!present) continue

    switch (field.type) {
      case 'date': {
        if (Number.isNaN(new Date(String(raw)).getTime())) {
          throw new FieldValidationError(`Field "${field.label}" must be a valid date`, field.field_key)
        }
        break
      }
      case 'checkbox': {
        if (typeof raw !== 'boolean') {
          throw new FieldValidationError(`Field "${field.label}" must be a checkbox boolean`, field.field_key)
        }
        break
      }
      case 'signature': {
        const ok = raw === true || (typeof raw === 'string' && raw.length > 0)
        if (!ok) {
          throw new FieldValidationError(`Field "${field.label}" requires a signature`, field.field_key)
        }
        break
      }
      case 'text':
      default:
        break
    }
  }
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export function computeContentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

// ---------------------------------------------------------------------------
// Signed PDF rendering (pdf-lib)
// ---------------------------------------------------------------------------

/**
 * Stamp field values + signature + signer identity + timestamp onto the source
 * PDF and return the final bytes. Dynamic import keeps pdf-lib off the hot path
 * for non-signing requests and makes it trivial to mock in tests.
 */
export async function renderSignedPdf(
  sourcePdfBytes: Uint8Array,
  fields: DocumentField[],
  values: FieldValues,
  identity: { signerName: string; signedAt: string },
  signatureDataUrl?: string
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const pdfDoc = await PDFDocument.load(sourcePdfBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const pages = pdfDoc.getPages()

  let signatureImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
  if (signatureDataUrl) {
    const base64 = signatureDataUrl.includes(',')
      ? signatureDataUrl.slice(signatureDataUrl.indexOf(',') + 1)
      : signatureDataUrl
    try {
      signatureImage = await pdfDoc.embedPng(Buffer.from(base64, 'base64'))
    } catch {
      signatureImage = null
    }
  }

  for (const field of fields) {
    const pageIndex = Math.max(0, (field.page ?? 1) - 1)
    if (pageIndex >= pages.length) continue
    const page = pages[pageIndex]
    const { width: pw, height: ph } = page.getSize()

    const x = (field.x_ratio ?? 0.1) * pw
    const boxHeight = (field.height_ratio ?? 0.05) * ph
    const boxWidth = (field.width_ratio ?? 0.3) * pw
    // y_ratio is from the top; PDF origin is bottom-left.
    const y = ph - (field.y_ratio ?? 0.1) * ph - boxHeight
    const raw = values[field.field_key]

    if (field.type === 'signature') {
      if (signatureImage) {
        page.drawImage(signatureImage, { x, y, width: boxWidth, height: boxHeight })
      } else if (typeof raw === 'string' && raw.length > 0) {
        page.drawText(raw, { x, y: y + boxHeight / 2, size: 14, font, color: rgb(0, 0, 0) })
      }
      continue
    }

    let text = ''
    if (field.type === 'checkbox') text = raw === true ? 'X' : ''
    else if (raw !== undefined && raw !== null) text = String(raw)
    if (text) {
      page.drawText(text, { x, y: y + boxHeight / 2, size: 12, font, color: rgb(0, 0, 0) })
    }
  }

  // Identity + timestamp footer on the first page (tamper-evidence context).
  if (pages.length > 0) {
    const page = pages[0]
    page.drawText(
      `Signed by ${identity.signerName} on ${identity.signedAt}`,
      { x: 20, y: 20, size: 8, font, color: rgb(0.3, 0.3, 0.3) }
    )
  }

  return pdfDoc.save()
}

// ---------------------------------------------------------------------------
// Core signing operation
// ---------------------------------------------------------------------------

export interface CreateSignedDocumentInput {
  companyId: string
  employeeId: string
  versionId: string
  signerName: string
  signatureType: 'typed' | 'drawn'
  fieldValues: FieldValues
  /** PNG data URL when signatureType === 'drawn'. */
  signatureDataUrl?: string
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * The core signing operation (spec §5):
 *  1. resolve + tenant-check the version
 *  2. validate required fields + types
 *  3. download the source PDF, stamp values + signature + identity into it
 *  4. sha256 the final bytes
 *  5. upload to the private `signed-documents` bucket (tenant-scoped path)
 *  6. insert the immutable ess_signed_documents row + a `signed` event
 *  7. recordAudit
 *  8. best-effort Phase 2 onboarding hook
 */
export async function createSignedDocument(
  input: CreateSignedDocumentInput
): Promise<SignedDocument> {
  const ctx = await getVersionForCompany(input.companyId, input.versionId)
  if (!ctx) throw new SigningError('Document version not found', 404)

  const fields = await listFields(input.companyId, input.versionId)
  validateFieldValues(fields, input.fieldValues)

  await recordEsignEvent({
    companyId: input.companyId,
    event: 'signing_started',
    actor: input.employeeId,
    documentId: ctx.documentId,
    versionId: ctx.versionId,
    ip: input.ipAddress,
  })

  // Download the source PDF from the documents bucket. file_url is a public URL;
  // derive the storage object path from it, falling back to treating it as a path.
  const sourcePath = storagePathFromUrl(ctx.fileUrl, SOURCE_DOCUMENTS_BUCKET)
  const { data: sourceFile, error: dlError } = await supabaseAdmin.storage
    .from(SOURCE_DOCUMENTS_BUCKET)
    .download(sourcePath)
  if (dlError || !sourceFile) {
    throw new SigningError(`Failed to load source document: ${dlError?.message ?? 'unknown'}`, 500)
  }
  const sourceBytes = new Uint8Array(await sourceFile.arrayBuffer())

  const signedAtIso = new Date().toISOString()
  const signedBytes = await renderSignedPdf(
    sourceBytes,
    fields,
    input.fieldValues,
    { signerName: input.signerName, signedAt: signedAtIso },
    input.signatureType === 'drawn' ? input.signatureDataUrl : undefined
  )

  const contentHash = computeContentHash(signedBytes)

  const storagePath = `${input.companyId}/${ctx.documentId}/${input.versionId}/${input.employeeId}-${Date.now()}.pdf`
  const { error: upError } = await supabaseAdmin.storage
    .from(SIGNED_DOCUMENTS_BUCKET)
    .upload(storagePath, Buffer.from(signedBytes), {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (upError) throw new SigningError(`Failed to store signed document: ${upError.message}`, 500)

  const { data: row, error: insError } = await supabaseAdmin
    .from('ess_signed_documents')
    .insert({
      company_id: input.companyId,
      document_id: ctx.documentId,
      version_id: input.versionId,
      employee_id: input.employeeId,
      signer_name: input.signerName,
      signature_type: input.signatureType,
      signature_data: input.signatureType === 'drawn' ? (input.signatureDataUrl ?? null) : input.signerName,
      field_values: input.fieldValues,
      signed_pdf_url: storagePath,
      content_hash: contentHash,
      signed_at: signedAtIso,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
    })
    .select('*')
    .single()
  if (insError || !row) {
    throw new SigningError(`Failed to record signed document: ${insError?.message ?? 'unknown'}`, 500)
  }
  const signed = row as SignedDocument

  await recordEsignEvent({
    companyId: input.companyId,
    event: 'signed',
    actor: input.employeeId,
    signedDocumentId: signed.id,
    documentId: ctx.documentId,
    versionId: input.versionId,
    ip: input.ipAddress,
    meta: { content_hash: contentHash },
  })
  await recordAudit({
    companyId: input.companyId,
    actorId: input.employeeId,
    action: 'esign.signed',
    target: { type: 'signed_document', id: signed.id },
    meta: { version_id: input.versionId, content_hash: contentHash },
  })

  // Auto-complete the linked onboarding step (doc_sign -> this document).
  await advanceOnboardingBestEffort(input.employeeId, ctx.documentId)

  return signed
}

/**
 * Best-effort onboarding hook for a signed document: auto-completes the signer's
 * `doc_sign` step linked to `documentId`, then recomputes their onboarding
 * status. Wrapped so a hook failure never breaks the signing operation.
 */
export async function advanceOnboardingBestEffort(
  employeeId: string,
  documentId: string
): Promise<void> {
  try {
    await completeLinkedOnboardingStep(employeeId, { stepType: 'doc_sign', refId: documentId })
  } catch (err) {
    console.error('[esign] onboarding hook failed (non-fatal):', (err as Error)?.message)
  }
}

// ---------------------------------------------------------------------------
// Signed-document reads (company-scoped)
// ---------------------------------------------------------------------------

export async function getSignedDocument(
  companyId: string,
  signedDocumentId: string
): Promise<SignedDocument | null> {
  const { data, error } = await supabaseAdmin
    .from('ess_signed_documents')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', signedDocumentId)
    .maybeSingle()
  if (error) throw new Error(`Failed to get signed document: ${error.message}`)
  return (data as SignedDocument) ?? null
}

export interface ListSignedFilter {
  employeeId?: string
  documentId?: string
  versionId?: string
}

export async function listSignedDocuments(
  companyId: string,
  filter: ListSignedFilter = {}
): Promise<SignedDocument[]> {
  let query = supabaseAdmin
    .from('ess_signed_documents')
    .select('*')
    .eq('company_id', companyId)
  if (filter.employeeId) query = query.eq('employee_id', filter.employeeId)
  if (filter.documentId) query = query.eq('document_id', filter.documentId)
  if (filter.versionId) query = query.eq('version_id', filter.versionId)
  const { data, error } = await query.order('signed_at', { ascending: false })
  if (error) throw new Error(`Failed to list signed documents: ${error.message}`)
  return (data ?? []) as SignedDocument[]
}

/**
 * Mint a short-lived signed URL for a signed document after re-checking company
 * ownership. Returns null if the signed doc does not belong to the company
 * (caller translates to 404). Records a `downloaded` event + audit entry.
 */
export async function createSignedDownloadUrl(
  companyId: string,
  signedDocumentId: string,
  actorId: string,
  expiresInSeconds = 60
): Promise<{ url: string; signedDocument: SignedDocument } | null> {
  const signed = await getSignedDocument(companyId, signedDocumentId)
  if (!signed) return null

  const { data, error } = await supabaseAdmin.storage
    .from(SIGNED_DOCUMENTS_BUCKET)
    .createSignedUrl(signed.signed_pdf_url, expiresInSeconds)
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message ?? 'unknown'}`)
  }

  await recordEsignEvent({
    companyId,
    event: 'downloaded',
    actor: actorId,
    signedDocumentId: signed.id,
    documentId: signed.document_id,
    versionId: signed.version_id,
  })
  await recordAudit({
    companyId,
    actorId,
    action: 'esign.downloaded',
    target: { type: 'signed_document', id: signed.id },
  })

  return { url: data.signedUrl, signedDocument: signed }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a storage object path from a Supabase public URL of the form
 * `.../storage/v1/object/public/<bucket>/<path>`. If the input is already a bare
 * path (legacy rows stored the path directly when upload failed), return it.
 */
export function storagePathFromUrl(fileUrl: string, bucket: string): string {
  const marker = `/object/public/${bucket}/`
  const idx = fileUrl.indexOf(marker)
  if (idx !== -1) return decodeURIComponent(fileUrl.slice(idx + marker.length))
  const signMarker = `/object/sign/${bucket}/`
  const sidx = fileUrl.indexOf(signMarker)
  if (sidx !== -1) {
    const rest = fileUrl.slice(sidx + signMarker.length)
    return decodeURIComponent(rest.split('?')[0])
  }
  return fileUrl
}

export type { FieldType }
