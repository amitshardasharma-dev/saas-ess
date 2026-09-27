// src/services/signing-sequence.ts
//
// MOS-720 — documents signed by several people in an admin-defined order.
//
// The admin lists the signers on a document version (signing_config.roles, in
// order) and marks which signer fills each field (ess_document_fields.signer_role).
// Every recipient gets their own copy (ess_signing_requests); each completed step
// is an immutable ess_signing_request_signatures row. A later signer cannot sign
// until every earlier step is complete. When the last step lands, the finished
// PDF is written to ess_signed_documents for the recipient — the same record the
// single-signer flow produces — so onboarding, reports and downloads are unchanged.
//
// "Sign once" named signers (e.g. an officer who pre-signs) sign a shared sheet
// (recipient_employee_id NULL) that applies to every copy.
//
// Versions without a multi-signer config never reach this module.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordAudit } from '@/lib/audit'
import { notifyEmployeeInbox, escapeHtml } from '@/lib/communications/notify'
import {
  getVersionForCompany,
  listFields,
  validateFieldValues,
  computeContentHash,
  renderMultiSignedPdf,
  recordEsignEvent,
  advanceOnboardingBestEffort,
  storagePathFromUrl,
  SigningError,
  SIGNED_DOCUMENTS_BUCKET,
  SOURCE_DOCUMENTS_BUCKET,
  type VersionContext,
} from '@/services/esign'
import {
  RECIPIENT_ROLE,
  SigningConfigSchema,
  type DocumentField,
  type FieldValues,
  type SignedDocument,
  type SignerRole,
  type SigningConfig,
} from '@/types/esign'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://saas-ess.vercel.app').replace(/\/$/, '')

export const SHARED = 'shared' as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SigningRequest {
  id: string
  company_id: string
  document_id: string
  version_id: string
  recipient_employee_id: string | null
  roles_snapshot: SignerRole[]
  status: 'in_progress' | 'completed' | 'cancelled'
  signed_document_id: string | null
  created_at: string
  completed_at: string | null
}

export interface StepSignature {
  id: string
  request_id: string
  role_key: string
  step_order: number
  signer_employee_id: string | null
  signer_name: string
  signature_type: 'typed' | 'drawn'
  signature_data: string | null
  field_values: FieldValues
  signing_location: string | null
  signed_at: string
}

export type StepStatus = 'completed' | 'active' | 'waiting'

export interface StepProgress {
  key: string
  label: string
  order: number
  signOnce: boolean
  assigneeType: 'recipient' | 'employee'
  assigneeEmployeeId: string | null
  assigneeName: string | null
  status: StepStatus
  signerName: string | null
  signedAt: string | null
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export function parseSigningConfig(raw: unknown): SigningConfig | null {
  if (!raw) return null
  const parsed = SigningConfigSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** Multi-signer = more than one signer. A lone recipient is the classic flow. */
export function isMultiSigner(cfg: SigningConfig | null): cfg is SigningConfig {
  return !!cfg && cfg.roles.length > 1
}

export async function getVersionSigningConfig(versionId: string): Promise<SigningConfig | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ess_document_versions')
      .select('signing_config')
      .eq('id', versionId)
      .maybeSingle()
    if (error || !data) return null
    return parseSigningConfig((data as { signing_config?: unknown }).signing_config)
  } catch {
    return null
  }
}

export function holdsRole(role: SignerRole, employeeId: string, recipientEmployeeId: string | null): boolean {
  if (role.assignee.type === 'recipient') return !!recipientEmployeeId && employeeId === recipientEmployeeId
  return role.assignee.employeeId === employeeId
}

export function fieldRole(f: Pick<DocumentField, 'signer_role'>): string {
  return f.signer_role || RECIPIENT_ROLE
}

// ---------------------------------------------------------------------------
// Requests + signatures
// ---------------------------------------------------------------------------

async function loadLiveRequest(companyId: string, versionId: string, recipient: string | null): Promise<SigningRequest | null> {
  let q = supabaseAdmin
    .from('ess_signing_requests')
    .select('*')
    .eq('company_id', companyId)
    .eq('version_id', versionId)
    .neq('status', 'cancelled')
  q = recipient ? q.eq('recipient_employee_id', recipient) : q.is('recipient_employee_id', null)
  const { data } = await q.limit(1).maybeSingle()
  return (data as SigningRequest) ?? null
}

async function getOrCreateRequest(
  companyId: string,
  ctx: VersionContext,
  recipient: string | null,
  roles: SignerRole[],
  createdBy: string | null
): Promise<{ request: SigningRequest; created: boolean }> {
  const existing = await loadLiveRequest(companyId, ctx.versionId, recipient)
  if (existing) return { request: existing, created: false }
  const { data, error } = await supabaseAdmin
    .from('ess_signing_requests')
    .insert({
      company_id: companyId,
      document_id: ctx.documentId,
      version_id: ctx.versionId,
      recipient_employee_id: recipient,
      roles_snapshot: roles,
      status: 'in_progress',
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error || !data) {
    // Lost a race with a concurrent creator — use theirs.
    const again = await loadLiveRequest(companyId, ctx.versionId, recipient)
    if (again) return { request: again, created: false }
    throw new SigningError(`Failed to start signing: ${error?.message ?? 'unknown'}`, 500)
  }
  return { request: data as SigningRequest, created: true }
}

async function loadSignatures(requestIds: string[]): Promise<StepSignature[]> {
  if (requestIds.length === 0) return []
  const { data } = await supabaseAdmin
    .from('ess_signing_request_signatures')
    .select('*')
    .in('request_id', requestIds)
  return (data ?? []) as StepSignature[]
}

function byRole(sigs: StepSignature[], requestId: string | null | undefined): Map<string, StepSignature> {
  const m = new Map<string, StepSignature>()
  if (!requestId) return m
  for (const s of sigs) if (s.request_id === requestId) m.set(s.role_key, s)
  return m
}

async function employeeNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  const m = new Map<string, string>()
  if (!uniq.length) return m
  const { data } = await supabaseAdmin.from('ess_employees').select('id, full_name').in('id', uniq)
  for (const e of (data ?? []) as Array<{ id: string; full_name: string | null }>) m.set(e.id, e.full_name ?? '')
  return m
}

/**
 * Walk the roles in order. Completed steps are done; the first incomplete step is
 * active; everything after it waits. Sign-once steps read the shared sheet.
 */
export function computeProgress(
  roles: SignerRole[],
  own: Map<string, StepSignature>,
  shared: Map<string, StepSignature>,
  names: Map<string, string>,
  recipientEmployeeId: string | null
): StepProgress[] {
  let blocked = false
  return roles.map((r, i) => {
    const sig = r.signOnce ? shared.get(r.key) : own.get(r.key)
    let status: StepStatus
    if (sig) status = 'completed'
    else if (!blocked) { status = 'active'; blocked = true }
    else status = 'waiting'
    const assigneeEmployeeId = r.assignee.type === 'employee' ? r.assignee.employeeId : recipientEmployeeId
    return {
      key: r.key,
      label: r.label,
      order: i + 1,
      signOnce: !!r.signOnce,
      assigneeType: r.assignee.type,
      assigneeEmployeeId,
      assigneeName: (assigneeEmployeeId && names.get(assigneeEmployeeId)) || (r.assignee.type === 'employee' ? r.assignee.name ?? null : null),
      status,
      signerName: sig?.signer_name ?? null,
      signedAt: sig?.signed_at ?? null,
    }
  })
}

function signUrl(documentId: string, versionId: string, recipient: string | null): string {
  return `${APP_URL}/dashboard/documents/${documentId}/sign?versionId=${versionId}&recipient=${recipient ?? SHARED}`
}

async function docTitle(documentId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('ess_documents').select('title').eq('id', documentId).maybeSingle()
  return (data as { title?: string } | null)?.title ?? 'a document'
}

async function notifyTurn(
  companyId: string,
  ctx: VersionContext,
  step: StepProgress,
  recipientEmployeeId: string,
  recipientName: string | null,
  senderAppUserId: string | null
): Promise<void> {
  if (!step.assigneeEmployeeId) return
  const title = await docTitle(ctx.documentId)
  const forWhom = step.assigneeType === 'recipient' ? '' : ` for ${escapeHtml(recipientName || 'a team member')}`
  await notifyEmployeeInbox({
    companyId,
    employeeId: step.assigneeEmployeeId,
    senderAppUserId,
    subject: `Your signature is needed: "${title}"`,
    bodyHtml: `
      <p>It is your turn to sign <strong>${escapeHtml(title)}</strong>${forWhom} as <strong>${escapeHtml(step.label)}</strong>.</p>
      <p><a href="${signUrl(ctx.documentId, ctx.versionId, recipientEmployeeId)}" style="color:#0d9488">Review &amp; sign now →</a></p>`,
  })
}

// ---------------------------------------------------------------------------
// Read model for the signing page
// ---------------------------------------------------------------------------

export interface SigningState {
  multi: boolean
  shared: boolean
  recipientEmployeeId: string | null
  recipientName: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  signedDocumentId: string | null
  steps: StepProgress[]
  /** The role the viewer can sign right now, or null. */
  myRole: string | null
  /** Label + name of the signer whose turn it is when it isn't the viewer's. */
  waitingFor: { label: string; name: string | null } | null
  /** Values already entered by completed signers (read-only on the page). */
  completedValues: FieldValues
  /** Completed signatures by role key, for display on the page. */
  completedSignatures: Record<string, { signerName: string; signatureType: 'typed' | 'drawn'; signatureDataUrl: string | null; signedAt: string }>
}

export async function getSigningState(input: {
  companyId: string
  documentId: string
  versionId: string
  viewer: { employeeId: string; isStaff: boolean; appUserId: string | null }
  recipient?: string | null
}): Promise<SigningState | { multi: false } | null> {
  const ctx = await getVersionForCompany(input.companyId, input.versionId)
  if (!ctx || ctx.documentId !== input.documentId) return null
  const config = await getVersionSigningConfig(input.versionId)
  if (!isMultiSigner(config)) return { multi: false }

  const isShared = input.recipient === SHARED
  const recipientId = isShared ? null : input.recipient || input.viewer.employeeId

  if (recipientId && recipientId !== input.viewer.employeeId) {
    const { data: emp } = await supabaseAdmin
      .from('ess_employees')
      .select('id')
      .eq('id', recipientId)
      .eq('company_id', input.companyId)
      .maybeSingle()
    if (!emp) return null
  }

  let request = await loadLiveRequest(input.companyId, input.versionId, recipientId)
  const holdsAny = config.roles.some((r) => holdsRole(r, input.viewer.employeeId, recipientId))
  if (!holdsAny && !input.viewer.isStaff) return null

  // Opening your own copy starts it, so the first signer gets notified even
  // when that isn't you (e.g. the officer signs first).
  if (!isShared && !request && recipientId === input.viewer.employeeId) {
    const res = await getOrCreateRequest(input.companyId, ctx, recipientId, config.roles, input.viewer.appUserId)
    request = res.request
    if (res.created) await notifyNextSigner(input.companyId, ctx, request, input.viewer.employeeId, input.viewer.appUserId)
  }

  const roles = isShared
    ? config.roles.filter((r) => r.signOnce)
    : request?.roles_snapshot ?? config.roles
  const sharedReq = roles.some((r) => r.signOnce) ? await loadLiveRequest(input.companyId, input.versionId, null) : null
  const sigs = await loadSignatures([request?.id, sharedReq?.id].filter((x): x is string => !!x))
  const own = byRole(sigs, request?.id)
  const shared = byRole(sigs, sharedReq?.id)
  const names = await employeeNames([
    ...(recipientId ? [recipientId] : []),
    ...roles.flatMap((r) => (r.assignee.type === 'employee' ? [r.assignee.employeeId] : [])),
  ])

  let steps: StepProgress[]
  if (isShared) {
    // Sign-once steps aren't sequenced against each other on the shared sheet.
    steps = roles.map((r, i) => {
      const sig = shared.get(r.key)
      const empId = r.assignee.type === 'employee' ? r.assignee.employeeId : null
      return {
        key: r.key, label: r.label, order: i + 1, signOnce: true, assigneeType: 'employee' as const,
        assigneeEmployeeId: empId, assigneeName: (empId && names.get(empId)) || null,
        status: sig ? ('completed' as const) : ('active' as const),
        signerName: sig?.signer_name ?? null, signedAt: sig?.signed_at ?? null,
      }
    })
  } else {
    steps = computeProgress(roles, own, shared, names, recipientId)
  }

  const active = isShared
    ? steps.find((s) => s.status === 'active' && s.assigneeEmployeeId === input.viewer.employeeId) ?? null
    : steps.find((s) => s.status === 'active') ?? null
  const activeRole = active ? roles.find((r) => r.key === active.key) ?? null : null
  const mine = !!(activeRole && holdsRole(activeRole, input.viewer.employeeId, recipientId))
  const done = request?.status === 'completed'

  const fields = await listFields(input.companyId, input.versionId)
  const completedValues: FieldValues = {}
  const completedSignatures: SigningState['completedSignatures'] = {}
  for (const r of roles) {
    const sig = r.signOnce ? shared.get(r.key) : own.get(r.key)
    if (!sig) continue
    for (const f of fields) {
      if (fieldRole(f) === r.key && sig.field_values[f.field_key] !== undefined) completedValues[f.field_key] = sig.field_values[f.field_key]
    }
    completedSignatures[r.key] = {
      signerName: sig.signer_name,
      signatureType: sig.signature_type,
      signatureDataUrl: sig.signature_type === 'drawn' ? sig.signature_data : null,
      signedAt: sig.signed_at,
    }
  }

  return {
    multi: true,
    shared: isShared,
    recipientEmployeeId: recipientId,
    recipientName: recipientId ? names.get(recipientId) ?? null : null,
    status: done ? 'completed' : request ? 'in_progress' : 'not_started',
    signedDocumentId: request?.signed_document_id ?? null,
    steps,
    myRole: !done && mine && active ? active.key : null,
    waitingFor: !done && active && !mine && !isShared ? { label: active.label, name: active.assigneeName } : null,
    completedValues,
    completedSignatures,
  }
}

// ---------------------------------------------------------------------------
// Signing a step
// ---------------------------------------------------------------------------

export interface SignStepInput {
  companyId: string
  documentId: string
  versionId: string
  /** Whose copy; defaults to the signer. 'shared' = a sign-once sheet. */
  recipient?: string | null
  signerEmployeeId: string
  signerAppUserId: string | null
  signerName: string
  signatureType: 'typed' | 'drawn'
  signatureDataUrl?: string
  fieldValues: FieldValues
  signingLocation?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface SignStepResult {
  role: string
  status: 'in_progress' | 'completed'
  signedDocumentId: string | null
  next: { label: string; name: string | null } | null
}

export async function signStep(input: SignStepInput): Promise<SignStepResult> {
  const ctx = await getVersionForCompany(input.companyId, input.versionId)
  if (!ctx || ctx.documentId !== input.documentId) throw new SigningError('Document version not found', 404)
  const config = await getVersionSigningConfig(input.versionId)
  if (!isMultiSigner(config)) throw new SigningError('This document does not use a signing order', 400)

  const isShared = input.recipient === SHARED
  const recipientId = isShared ? null : input.recipient || input.signerEmployeeId

  if (recipientId && recipientId !== input.signerEmployeeId) {
    const { data: emp } = await supabaseAdmin
      .from('ess_employees')
      .select('id')
      .eq('id', recipientId)
      .eq('company_id', input.companyId)
      .maybeSingle()
    if (!emp) throw new SigningError('Not found', 404)
  }

  let role: SignerRole
  let target: SigningRequest
  let copy: SigningRequest | null = null

  if (isShared) {
    const shared = await getOrCreateRequest(input.companyId, ctx, null, config.roles.filter((r) => r.signOnce), input.signerAppUserId)
    target = shared.request
    const sigs = byRole(await loadSignatures([target.id]), target.id)
    const mine = config.roles.find((r) => r.signOnce && holdsRole(r, input.signerEmployeeId, null) && !sigs.has(r.key))
    if (!mine) throw new SigningError('There is nothing for you to sign on this document', 403)
    role = mine
  } else {
    copy = (await getOrCreateRequest(input.companyId, ctx, recipientId, config.roles, input.signerAppUserId)).request
    if (copy.status === 'completed') throw new SigningError('This copy has already been fully signed', 409)
    const roles = copy.roles_snapshot
    const sharedReq = roles.some((r) => r.signOnce) ? await loadLiveRequest(input.companyId, input.versionId, null) : null
    const sigs = await loadSignatures([copy.id, sharedReq?.id].filter((x): x is string => !!x))
    const names = await employeeNames(roles.flatMap((r) => (r.assignee.type === 'employee' ? [r.assignee.employeeId] : [])))
    const steps = computeProgress(roles, byRole(sigs, copy.id), byRole(sigs, sharedReq?.id), names, recipientId)
    const active = steps.find((s) => s.status === 'active')
    if (!active) throw new SigningError('This copy has already been fully signed', 409)
    const activeRole = roles.find((r) => r.key === active.key)!
    if (!holdsRole(activeRole, input.signerEmployeeId, recipientId)) {
      if (roles.some((r) => holdsRole(r, input.signerEmployeeId, recipientId))) {
        throw new SigningError(`Waiting for ${active.label}${active.assigneeName ? ` (${active.assigneeName})` : ''} to sign first`, 409)
      }
      throw new SigningError('You are not a signer on this copy', 403)
    }
    role = activeRole
    target = activeRole.signOnce
      ? (await getOrCreateRequest(input.companyId, ctx, null, config.roles.filter((r) => r.signOnce), input.signerAppUserId)).request
      : copy
  }

  // Only this signer's fields are validated and kept.
  const fields = (await listFields(input.companyId, input.versionId)).filter((f) => fieldRole(f) === role.key)
  const values: FieldValues = {}
  for (const f of fields) if (input.fieldValues[f.field_key] !== undefined) values[f.field_key] = input.fieldValues[f.field_key]
  validateFieldValues(fields, values)

  const stepOrder = config.roles.findIndex((r) => r.key === role.key) + 1
  const signedAt = new Date().toISOString()
  const { data: row, error } = await supabaseAdmin
    .from('ess_signing_request_signatures')
    .insert({
      company_id: input.companyId,
      request_id: target.id,
      role_key: role.key,
      step_order: stepOrder,
      signer_employee_id: input.signerEmployeeId,
      signer_name: input.signerName,
      signature_type: input.signatureType,
      signature_data: input.signatureType === 'drawn' ? (input.signatureDataUrl ?? null) : input.signerName,
      field_values: values,
      signing_location: input.signingLocation ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      signed_at: signedAt,
    })
    .select('id')
    .single()
  if (error || !row) {
    if (error && /duplicate key/i.test(error.message)) throw new SigningError('This step has already been signed', 409)
    throw new SigningError(`Failed to record signature: ${error?.message ?? 'unknown'}`, 500)
  }

  await recordEsignEvent({
    companyId: input.companyId,
    event: 'signed',
    actor: input.signerEmployeeId,
    documentId: ctx.documentId,
    versionId: ctx.versionId,
    ip: input.ipAddress,
    meta: { step: stepOrder, role: role.key, role_label: role.label, request_id: target.id, recipient_employee_id: recipientId, shared: target.recipient_employee_id === null },
  })
  await recordAudit({
    companyId: input.companyId,
    actorId: input.signerAppUserId,
    action: 'esign.step_signed',
    target: { type: 'signing_request', id: target.id },
    meta: { version_id: ctx.versionId, role: role.key, role_label: role.label, step: stepOrder, recipient_employee_id: recipientId, signer_employee_id: input.signerEmployeeId },
  })

  if (role.signOnce) {
    // A sign-once signature can unblock or finish every copy of this version.
    await advanceAllCopies(input.companyId, ctx, input.signerAppUserId, copy?.id)
    if (!copy) return { role: role.key, status: 'in_progress', signedDocumentId: null, next: null }
  }
  const result = await advanceCopy(input.companyId, ctx, copy!, input.signerEmployeeId, input.signerAppUserId)
  return { role: role.key, ...result }
}

/** Notify whoever's turn it is on a copy (never the person who just acted). */
async function notifyNextSigner(
  companyId: string,
  ctx: VersionContext,
  request: SigningRequest,
  actorEmployeeId: string | null,
  senderAppUserId: string | null
): Promise<{ label: string; name: string | null } | null> {
  if (!request.recipient_employee_id) return null
  const roles = request.roles_snapshot
  const sharedReq = roles.some((r) => r.signOnce) ? await loadLiveRequest(companyId, ctx.versionId, null) : null
  const sigs = await loadSignatures([request.id, sharedReq?.id].filter((x): x is string => !!x))
  const names = await employeeNames([
    request.recipient_employee_id,
    ...roles.flatMap((r) => (r.assignee.type === 'employee' ? [r.assignee.employeeId] : [])),
  ])
  const steps = computeProgress(roles, byRole(sigs, request.id), byRole(sigs, sharedReq?.id), names, request.recipient_employee_id)
  const active = steps.find((s) => s.status === 'active')
  if (!active) return null
  // Sign-once signers are told once, when the order is saved, not per copy.
  if (!active.signOnce && active.assigneeEmployeeId && active.assigneeEmployeeId !== actorEmployeeId) {
    await notifyTurn(companyId, ctx, active, request.recipient_employee_id, names.get(request.recipient_employee_id) ?? null, senderAppUserId)
  }
  return { label: active.label, name: active.assigneeName }
}

async function advanceAllCopies(
  companyId: string,
  ctx: VersionContext,
  senderAppUserId: string | null,
  excludeRequestId?: string
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('ess_signing_requests')
    .select('*')
    .eq('company_id', companyId)
    .eq('version_id', ctx.versionId)
    .eq('status', 'in_progress')
    .not('recipient_employee_id', 'is', null)
  for (const req of (data ?? []) as SigningRequest[]) {
    if (req.id === excludeRequestId) continue
    try {
      await advanceCopy(companyId, ctx, req, null, senderAppUserId)
    } catch (err) {
      console.error('[signing] advancing copy failed (non-fatal):', req.id, (err as Error)?.message)
    }
  }
}

/** Finish the copy if every step is signed, otherwise tell the next signer. */
async function advanceCopy(
  companyId: string,
  ctx: VersionContext,
  request: SigningRequest,
  actorEmployeeId: string | null,
  senderAppUserId: string | null
): Promise<Omit<SignStepResult, 'role'>> {
  const roles = request.roles_snapshot
  const sharedReq = roles.some((r) => r.signOnce) ? await loadLiveRequest(companyId, ctx.versionId, null) : null
  const sigs = await loadSignatures([request.id, sharedReq?.id].filter((x): x is string => !!x))
  const own = byRole(sigs, request.id)
  const shared = byRole(sigs, sharedReq?.id)
  const allSigned = roles.every((r) => (r.signOnce ? shared : own).has(r.key))
  if (!allSigned) {
    const next = await notifyNextSigner(companyId, ctx, request, actorEmployeeId, senderAppUserId)
    return { status: 'in_progress', signedDocumentId: null, next }
  }
  const signed = await finalizeCopy(companyId, ctx, request, roles, own, shared, senderAppUserId)
  return { status: 'completed', signedDocumentId: signed.id, next: null }
}

/** WinAnsi-safe text for the standard PDF font. */
const pdfSafe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')

async function finalizeCopy(
  companyId: string,
  ctx: VersionContext,
  request: SigningRequest,
  roles: SignerRole[],
  own: Map<string, StepSignature>,
  shared: Map<string, StepSignature>,
  senderAppUserId: string | null
): Promise<SignedDocument> {
  const recipientId = request.recipient_employee_id!
  const fields = await listFields(companyId, ctx.versionId)

  const values: FieldValues = {}
  const signatures: Record<string, { signerName: string; signatureDataUrl?: string | null }> = {}
  const footer: string[] = []
  const signers: Array<Record<string, unknown>> = []
  roles.forEach((r, i) => {
    const sig = (r.signOnce ? shared : own).get(r.key)!
    for (const f of fields) {
      if (fieldRole(f) === r.key && sig.field_values[f.field_key] !== undefined) values[f.field_key] = sig.field_values[f.field_key]
    }
    signatures[r.key] = { signerName: sig.signer_name, signatureDataUrl: sig.signature_type === 'drawn' ? sig.signature_data : null }
    const where = sig.signing_location ? ` at ${sig.signing_location}` : ''
    footer.push(pdfSafe(`${i + 1}. ${r.label}: signed by ${sig.signer_name}${where} on ${sig.signed_at}`))
    signers.push({ step: i + 1, role: r.key, label: r.label, signer_name: sig.signer_name, signer_employee_id: sig.signer_employee_id, signed_at: sig.signed_at, signature_id: sig.id })
  })

  const sourcePath = storagePathFromUrl(ctx.fileUrl, SOURCE_DOCUMENTS_BUCKET)
  const { data: sourceFile, error: dlError } = await supabaseAdmin.storage.from(SOURCE_DOCUMENTS_BUCKET).download(sourcePath)
  if (dlError || !sourceFile) throw new SigningError(`Failed to load source document: ${dlError?.message ?? 'unknown'}`, 500)
  const bytes = await renderMultiSignedPdf(new Uint8Array(await sourceFile.arrayBuffer()), fields, values, signatures, footer)
  const contentHash = computeContentHash(bytes)

  const storagePath = `${companyId}/${ctx.documentId}/${ctx.versionId}/${recipientId}-${Date.now()}.pdf`
  const { error: upError } = await supabaseAdmin.storage
    .from(SIGNED_DOCUMENTS_BUCKET)
    .upload(storagePath, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false })
  if (upError) throw new SigningError(`Failed to store signed document: ${upError.message}`, 500)

  const recipientSig = own.get(RECIPIENT_ROLE)!
  const signedAt = new Date().toISOString()
  const { data: row, error: insError } = await supabaseAdmin
    .from('ess_signed_documents')
    .insert({
      company_id: companyId,
      document_id: ctx.documentId,
      version_id: ctx.versionId,
      employee_id: recipientId,
      signer_name: recipientSig.signer_name,
      signature_type: recipientSig.signature_type,
      signature_data: recipientSig.signature_data,
      field_values: values,
      signed_pdf_url: storagePath,
      content_hash: contentHash,
      signed_at: signedAt,
      signing_location: recipientSig.signing_location,
      ip_address: null,
      user_agent: null,
    })
    .select('*')
    .single()
  if (insError || !row) throw new SigningError(`Failed to record signed document: ${insError?.message ?? 'unknown'}`, 500)
  const signed = row as SignedDocument

  await supabaseAdmin
    .from('ess_signing_requests')
    .update({ status: 'completed', completed_at: signedAt, signed_document_id: signed.id })
    .eq('id', request.id)
    .eq('status', 'in_progress')

  await recordEsignEvent({
    companyId,
    event: 'signed',
    actor: recipientId,
    signedDocumentId: signed.id,
    documentId: ctx.documentId,
    versionId: ctx.versionId,
    meta: { content_hash: contentHash, request_id: request.id, completed: true, signers },
  })
  await recordAudit({
    companyId,
    actorId: senderAppUserId,
    action: 'esign.signed',
    target: { type: 'signed_document', id: signed.id },
    meta: { version_id: ctx.versionId, content_hash: contentHash, request_id: request.id, signing_order: signers },
  })

  await advanceOnboardingBestEffort(recipientId, ctx.documentId)
  try {
    await supabaseAdmin
      .from('ess_document_acknowledgments')
      .upsert(
        { document_id: ctx.documentId, version_id: ctx.versionId, employee_id: recipientId, acknowledged_at: signedAt },
        { onConflict: 'document_id,version_id,employee_id' },
      )
  } catch (err) {
    console.error('[signing] acknowledgment-on-sign failed (non-fatal):', (err as Error)?.message)
  }

  const title = await docTitle(ctx.documentId)
  await notifyEmployeeInbox({
    companyId,
    employeeId: recipientId,
    senderAppUserId,
    subject: `"${title}" is fully signed`,
    bodyHtml: `<p>Everyone has now signed <strong>${escapeHtml(title)}</strong>. Your signed copy is available in Documents.</p>
      <p><a href="${APP_URL}/dashboard/documents/${ctx.documentId}" style="color:#0d9488">View document →</a></p>`,
  })

  return signed
}

// ---------------------------------------------------------------------------
// Admin: order changes, restarts, status, reminders
// ---------------------------------------------------------------------------

/** In-progress copies of a version that already carry at least one signature. */
export async function countStartedCopies(companyId: string, versionId: string): Promise<number> {
  const { data: reqs } = await supabaseAdmin
    .from('ess_signing_requests')
    .select('id')
    .eq('company_id', companyId)
    .eq('version_id', versionId)
    .eq('status', 'in_progress')
  const ids = ((reqs ?? []) as Array<{ id: string }>).map((r) => r.id)
  if (!ids.length) return 0
  const sigs = await loadSignatures(ids)
  return new Set(sigs.map((s) => s.request_id)).size
}

/**
 * Cancel live, unfinished copies of a version (and its shared sheet). Their
 * signatures stay on record under the cancelled request as evidence, but no
 * longer count. Completed copies are never touched.
 */
export async function cancelInProgress(
  companyId: string,
  versionId: string,
  actorAppUserId: string | null,
  reason: string,
  recipientEmployeeId?: string
): Promise<number> {
  let q = supabaseAdmin
    .from('ess_signing_requests')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: actorAppUserId, cancel_reason: reason })
    .eq('company_id', companyId)
    .eq('version_id', versionId)
    .eq('status', 'in_progress')
  if (recipientEmployeeId) q = q.eq('recipient_employee_id', recipientEmployeeId)
  const { data } = await q.select('id')
  const n = (data ?? []).length
  if (n) {
    await recordAudit({
      companyId,
      actorId: actorAppUserId,
      action: 'esign.signing_restarted',
      target: { type: 'document_version', id: versionId },
      meta: { cancelled_requests: n, reason, recipient_employee_id: recipientEmployeeId ?? null },
    })
  }
  return n
}

/** Save the signing order on a version (null = back to a single signer). */
export async function saveSigningConfig(
  companyId: string,
  versionId: string,
  config: SigningConfig | null,
  actorAppUserId: string | null
): Promise<void> {
  const stored = config && config.roles.length > 1 ? config : null
  const { error } = await supabaseAdmin.from('ess_document_versions').update({ signing_config: stored }).eq('id', versionId)
  if (error) throw new Error(`Failed to save signing order: ${error.message}`)
  await recordAudit({
    companyId,
    actorId: actorAppUserId,
    action: 'esign.signing_order_saved',
    target: { type: 'document_version', id: versionId },
    meta: { roles: stored?.roles.map((r, i) => ({ step: i + 1, key: r.key, label: r.label, assignee: r.assignee, sign_once: !!r.signOnce })) ?? null },
  })
}

export function signingConfigEquals(a: SigningConfig | null, b: SigningConfig | null): boolean {
  const norm = (c: SigningConfig | null) =>
    JSON.stringify(isMultiSigner(c) ? c.roles.map((r) => ({ k: r.key, a: r.assignee.type === 'employee' ? r.assignee.employeeId : 'r', o: !!r.signOnce })) : null)
  return norm(a) === norm(b)
}

/** Tell sign-once signers they have a one-time signature to give. */
export async function notifySignOnceSigners(
  companyId: string,
  ctx: VersionContext,
  config: SigningConfig,
  senderAppUserId: string | null
): Promise<void> {
  const title = await docTitle(ctx.documentId)
  for (const r of config.roles) {
    if (!r.signOnce || r.assignee.type !== 'employee') continue
    await notifyEmployeeInbox({
      companyId,
      employeeId: r.assignee.employeeId,
      senderAppUserId,
      subject: `Please sign "${title}" once as ${r.label}`,
      bodyHtml: `<p>You have been set as <strong>${escapeHtml(r.label)}</strong> on <strong>${escapeHtml(title)}</strong>. Sign it once and your signature is applied to every copy.</p>
        <p><a href="${signUrl(ctx.documentId, ctx.versionId, null)}" style="color:#0d9488">Review &amp; sign now →</a></p>`,
    })
  }
}

export interface CopyProgress {
  status: 'not_started' | 'in_progress' | 'completed'
  steps: StepProgress[]
}

/** Per-recipient progress for the admin status report. */
export async function progressForRecipients(
  companyId: string,
  versionId: string,
  config: SigningConfig,
  recipientIds: string[]
): Promise<Map<string, CopyProgress>> {
  const { data } = await supabaseAdmin
    .from('ess_signing_requests')
    .select('*')
    .eq('company_id', companyId)
    .eq('version_id', versionId)
    .neq('status', 'cancelled')
  const reqs = (data ?? []) as SigningRequest[]
  const sharedReq = reqs.find((r) => r.recipient_employee_id === null) ?? null
  const byRecipient = new Map(reqs.filter((r) => r.recipient_employee_id).map((r) => [r.recipient_employee_id!, r]))
  const sigs = await loadSignatures(reqs.map((r) => r.id))
  const shared = byRole(sigs, sharedReq?.id)
  const names = await employeeNames(config.roles.flatMap((r) => (r.assignee.type === 'employee' ? [r.assignee.employeeId] : [])))
  const out = new Map<string, CopyProgress>()
  for (const id of recipientIds) {
    const req = byRecipient.get(id)
    const steps = computeProgress(req?.roles_snapshot ?? config.roles, byRole(sigs, req?.id), shared, names, id)
    out.set(id, { status: req ? (req.status === 'completed' ? 'completed' : 'in_progress') : 'not_started', steps })
  }
  return out
}

/**
 * Remind the right people for the given recipients: start each copy if needed
 * and message whoever's turn it is (the recipient or a named signer). One
 * message per person. Returns how many people were messaged.
 */
export async function remindCopies(
  companyId: string,
  ctx: VersionContext,
  config: SigningConfig,
  recipientIds: string[],
  senderAppUserId: string | null
): Promise<number> {
  const turnFor = new Map<string, Array<{ recipientId: string; label: string }>>()
  const progress = await progressForRecipients(companyId, ctx.versionId, config, recipientIds)
  for (const id of recipientIds) {
    await getOrCreateRequest(companyId, ctx, id, config.roles, senderAppUserId)
    const active = progress.get(id)?.steps.find((s) => s.status === 'active')
    if (!active?.assigneeEmployeeId) continue
    const list = turnFor.get(active.assigneeEmployeeId) ?? []
    list.push({ recipientId: id, label: active.label })
    turnFor.set(active.assigneeEmployeeId, list)
  }
  const title = await docTitle(ctx.documentId)
  let reminded = 0
  for (const [employeeId, items] of turnFor) {
    const own = items.find((i) => i.recipientId === employeeId)
    const others = items.filter((i) => i.recipientId !== employeeId)
    const links = own
      ? `<p><a href="${signUrl(ctx.documentId, ctx.versionId, employeeId)}" style="color:#0d9488">Review &amp; sign now →</a></p>`
      : `<p>${others.length} ${others.length === 1 ? 'copy is' : 'copies are'} waiting for you as <strong>${escapeHtml(others[0].label)}</strong>. Open <a href="${APP_URL}/dashboard/documents/sign" style="color:#0d9488">E-Signatures</a> to sign them.</p>`
    const id = await notifyEmployeeInbox({
      companyId,
      employeeId,
      senderAppUserId,
      subject: `Action required: please sign "${title}"`,
      bodyHtml: `<p>You have a document awaiting your signature: <strong>${escapeHtml(title)}</strong>.</p>${links}`,
    })
    if (id) reminded++
  }
  return reminded
}

export interface QueueItem {
  documentId: string
  title: string
  versionId: string
  recipient: string
  recipientName: string | null
  roleLabel: string
  signOnce: boolean
  since: string
}

/** Copies (and sign-once sheets) waiting for this person as a named signer. */
export async function listMySigningQueue(companyId: string, employeeId: string): Promise<QueueItem[]> {
  const items: QueueItem[] = []

  const { data: reqData } = await supabaseAdmin
    .from('ess_signing_requests')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'in_progress')
    .not('recipient_employee_id', 'is', null)
    .filter('roles_snapshot', 'cs', JSON.stringify([{ assignee: { employeeId } }]))
  const reqs = (reqData ?? []) as SigningRequest[]

  const versionIds = [...new Set(reqs.map((r) => r.version_id))]
  const { data: sharedData } = versionIds.length
    ? await supabaseAdmin.from('ess_signing_requests').select('*').eq('company_id', companyId).neq('status', 'cancelled').is('recipient_employee_id', null).in('version_id', versionIds)
    : { data: [] }
  const sharedReqs = (sharedData ?? []) as SigningRequest[]
  const sigs = await loadSignatures([...reqs.map((r) => r.id), ...sharedReqs.map((r) => r.id)])
  const names = await employeeNames(reqs.map((r) => r.recipient_employee_id!))
  const titles = new Map<string, string>()
  const docIds = [...new Set(reqs.map((r) => r.document_id))]

  // Sign-once sheets for versions that name this person.
  const { data: verData } = await supabaseAdmin
    .from('ess_document_versions')
    .select('id, document_id, signing_config, uploaded_at')
    .contains('signing_config', { roles: [{ assignee: { employeeId }, signOnce: true }] })
  const onceVersions = (verData ?? []) as Array<{ id: string; document_id: string; signing_config: unknown; uploaded_at: string | null }>
  docIds.push(...onceVersions.map((v) => v.document_id))

  if (docIds.length) {
    const { data: docs } = await supabaseAdmin
      .from('ess_documents')
      .select('id, title, company_id')
      .eq('company_id', companyId)
      .in('id', [...new Set(docIds)])
    for (const d of (docs ?? []) as Array<{ id: string; title: string }>) titles.set(d.id, d.title)
  }

  for (const r of reqs) {
    if (!titles.has(r.document_id)) continue
    const sharedReq = sharedReqs.find((s) => s.version_id === r.version_id)
    const steps = computeProgress(r.roles_snapshot, byRole(sigs, r.id), byRole(sigs, sharedReq?.id), names, r.recipient_employee_id)
    const active = steps.find((s) => s.status === 'active')
    if (!active || active.signOnce || active.assigneeType !== 'employee' || active.assigneeEmployeeId !== employeeId) continue
    items.push({
      documentId: r.document_id, title: titles.get(r.document_id)!, versionId: r.version_id,
      recipient: r.recipient_employee_id!, recipientName: names.get(r.recipient_employee_id!) ?? null,
      roleLabel: active.label, signOnce: false, since: r.created_at,
    })
  }

  for (const v of onceVersions) {
    if (!titles.has(v.document_id)) continue
    // Only the document's current (latest) version is live.
    const { data: latest } = await supabaseAdmin
      .from('ess_document_versions').select('id').eq('document_id', v.document_id)
      .order('version_number', { ascending: false }).limit(1).maybeSingle()
    if ((latest as { id?: string } | null)?.id !== v.id) continue
    const cfg = parseSigningConfig(v.signing_config)
    if (!isMultiSigner(cfg)) continue
    const sharedReq = await loadLiveRequest(companyId, v.id, null)
    const signedRoles = byRole(await loadSignatures(sharedReq ? [sharedReq.id] : []), sharedReq?.id)
    for (const r of cfg.roles) {
      if (!r.signOnce || r.assignee.type !== 'employee' || r.assignee.employeeId !== employeeId || signedRoles.has(r.key)) continue
      items.push({
        documentId: v.document_id, title: titles.get(v.document_id)!, versionId: v.id,
        recipient: SHARED, recipientName: null, roleLabel: r.label, signOnce: true, since: v.uploaded_at ?? '',
      })
    }
  }

  return items.sort((a, b) => a.since.localeCompare(b.since))
}
