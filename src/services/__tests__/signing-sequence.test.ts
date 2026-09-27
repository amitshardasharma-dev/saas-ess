/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn(), storage: { from: jest.fn() } } }))

import { computeProgress, holdsRole, isMultiSigner, parseSigningConfig, signingConfigEquals, type StepSignature } from '@/services/signing-sequence'
import { SigningConfigSchema, DefineFieldsSchema, type SignerRole } from '@/types/esign'

const OFFICER = '11111111-1111-4111-8111-111111111111'
const VOL = '22222222-2222-4222-8222-222222222222'

const officer: SignerRole = { key: 'officer', label: 'Authorised Officer', assignee: { type: 'employee', employeeId: OFFICER } }
const recipient: SignerRole = { key: 'recipient', label: 'Volunteer', assignee: { type: 'recipient' } }

const sig = (role: string, requestId = 'req'): StepSignature => ({
  id: `s-${role}`, request_id: requestId, role_key: role, step_order: 1, signer_employee_id: null,
  signer_name: role, signature_type: 'typed', signature_data: role, field_values: {}, signing_location: null, signed_at: '2026-09-27T00:00:00Z',
})
const names = new Map([[OFFICER, 'Shone Benjamin'], [VOL, 'Virnie Bagonbon']])

describe('computeProgress (MOS-720)', () => {
  it('makes only the first unsigned step active; later steps wait', () => {
    const steps = computeProgress([officer, recipient], new Map(), new Map(), names, VOL)
    expect(steps.map((s) => s.status)).toEqual(['active', 'waiting'])
    expect(steps[0].assigneeName).toBe('Shone Benjamin')
    expect(steps[1].assigneeName).toBe('Virnie Bagonbon')
  })

  it('moves to the next signer once the earlier one has signed', () => {
    const steps = computeProgress([officer, recipient], new Map([['officer', sig('officer')]]), new Map(), names, VOL)
    expect(steps.map((s) => s.status)).toEqual(['completed', 'active'])
  })

  it('respects a volunteer-first order', () => {
    const steps = computeProgress([recipient, officer], new Map(), new Map(), names, VOL)
    expect(steps.map((s) => s.status)).toEqual(['active', 'waiting'])
  })

  it('reads sign-once steps from the shared sheet', () => {
    const once = { ...officer, signOnce: true }
    const steps = computeProgress([once, recipient], new Map(), new Map([['officer', sig('officer', 'shared')]]), names, VOL)
    expect(steps.map((s) => s.status)).toEqual(['completed', 'active'])
  })
})

describe('holdsRole', () => {
  it('matches the recipient only on their own copy, and named signers by id', () => {
    expect(holdsRole(recipient, VOL, VOL)).toBe(true)
    expect(holdsRole(recipient, OFFICER, VOL)).toBe(false)
    expect(holdsRole(officer, OFFICER, VOL)).toBe(true)
    expect(holdsRole(officer, VOL, VOL)).toBe(false)
  })
})

describe('signing config validation', () => {
  it('accepts officer + recipient', () => {
    expect(SigningConfigSchema.safeParse({ roles: [officer, recipient] }).success).toBe(true)
  })
  it('requires exactly one recipient', () => {
    expect(SigningConfigSchema.safeParse({ roles: [officer] }).success).toBe(false)
    expect(SigningConfigSchema.safeParse({ roles: [recipient, { ...recipient }] }).success).toBe(false)
  })
  it('rejects duplicate keys and sign-once recipients', () => {
    expect(SigningConfigSchema.safeParse({ roles: [officer, { ...officer }, recipient] }).success).toBe(false)
    expect(SigningConfigSchema.safeParse({ roles: [officer, { ...recipient, signOnce: true }] }).success).toBe(false)
  })
  it('treats a lone recipient as the classic single-signer flow', () => {
    expect(isMultiSigner(parseSigningConfig({ roles: [recipient] }))).toBe(false)
    expect(isMultiSigner(parseSigningConfig(null))).toBe(false)
    expect(isMultiSigner(parseSigningConfig({ roles: [officer, recipient] }))).toBe(true)
  })
  it('detects order changes but ignores label edits', () => {
    const a = { roles: [officer, recipient] }
    expect(signingConfigEquals(a, { roles: [{ ...officer, label: 'Manager' }, recipient] })).toBe(true)
    expect(signingConfigEquals(a, { roles: [recipient, officer] })).toBe(false)
    expect(signingConfigEquals(a, null)).toBe(false)
  })
  it('keeps the old fields payload valid (no signerRole / signingConfig)', () => {
    const r = DefineFieldsSchema.safeParse({ versionId: '33333333-3333-4333-8333-333333333333', fields: [{ fieldKey: 'signature', label: 'Signature', type: 'signature' }] })
    expect(r.success).toBe(true)
  })
})
