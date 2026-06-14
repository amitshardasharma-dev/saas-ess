/**
 * @jest-environment node
 *
 * Renewal expiry auto-recalc (spec feature #14) — PATCH /api/certifications/[id].
 *
 * Regression guard for the bug where changing completion_date on a renewal left
 * the STALE old expiry because the PATCH handler never called calcExpiry. The
 * recalc decision is extracted as the pure `resolveRenewalExpiry`, mirrored from
 * the POST handler's auto-derive, so we can assert it deterministically.
 *
 * Asserts:
 *  - PATCH with a new completion_date and NO expiry -> expiry = calcExpiry(newCompletion, validity_months).
 *  - PATCH with an explicit expiry_date -> that value wins (override preserved).
 *  - No cert_type / null validity -> expiry stays null (calcExpiry handles it).
 *  - Neither date supplied -> existing expiry is preserved (no spurious recalc).
 */
// resolveRenewalExpiry lives in the route module, whose import graph constructs
// the service-role Supabase client at load (needs env vars). Stub the data-access
// modules so importing the pure helper doesn't require a live Supabase config —
// same pattern as the compliance integration suite. The helper itself does no I/O.
jest.mock('@/lib/supabase-server', () => ({ supabaseAdmin: { from: jest.fn() } }))
jest.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: jest.fn() } }))

import { resolveRenewalExpiry } from '@/lib/compliance/expiry'
import { calcExpiry } from '@/lib/compliance/expiry'

describe('resolveRenewalExpiry — renewal expiry auto-recalc', () => {
  it('recalculates expiry from a NEW completion_date when no expiry is supplied (the bug fix)', () => {
    const newCompletion = '2026-06-14'
    const validityMonths = 12
    const result = resolveRenewalExpiry({
      expiryProvided: false,
      providedExpiry: undefined,
      completionProvided: true,
      newCompletion,
      validityMonths,
      existingExpiry: '2025-01-01', // STALE old expiry — must NOT survive.
    })
    expect(result).toBe(calcExpiry(newCompletion, validityMonths))
    expect(result).toBe('2027-06-14')
    // Explicitly prove the stale value was discarded.
    expect(result).not.toBe('2025-01-01')
  })

  it('honors a custom validity window on recalc (e.g. 24 months)', () => {
    const result = resolveRenewalExpiry({
      expiryProvided: false,
      providedExpiry: undefined,
      completionProvided: true,
      newCompletion: '2026-02-28',
      validityMonths: 24,
      existingExpiry: '2024-01-01',
    })
    expect(result).toBe(calcExpiry('2026-02-28', 24))
    expect(result).toBe('2028-02-28')
  })

  it('lets an explicitly-supplied expiry_date win over any recalc', () => {
    const result = resolveRenewalExpiry({
      expiryProvided: true,
      providedExpiry: '2030-12-31',
      completionProvided: true, // completion also changed, but explicit expiry wins.
      newCompletion: '2026-06-14',
      validityMonths: 12,
      existingExpiry: '2025-01-01',
    })
    expect(result).toBe('2030-12-31')
  })

  it('respects an explicit null expiry (caller clearing the expiry)', () => {
    const result = resolveRenewalExpiry({
      expiryProvided: true,
      providedExpiry: null,
      completionProvided: false,
      newCompletion: undefined,
      validityMonths: 12,
      existingExpiry: '2025-01-01',
    })
    expect(result).toBeNull()
  })

  it('yields null expiry when the cert has no validity (no cert_type / never expires)', () => {
    const result = resolveRenewalExpiry({
      expiryProvided: false,
      providedExpiry: undefined,
      completionProvided: true,
      newCompletion: '2026-06-14',
      validityMonths: null,
      existingExpiry: null,
    })
    expect(result).toBeNull()
  })

  it('preserves the existing expiry when neither date is supplied (no spurious recalc)', () => {
    const result = resolveRenewalExpiry({
      expiryProvided: false,
      providedExpiry: undefined,
      completionProvided: false,
      newCompletion: undefined,
      validityMonths: 12,
      existingExpiry: '2025-09-09',
    })
    expect(result).toBe('2025-09-09')
  })

  it('clamps to end-of-month on recalc, matching calcExpiry semantics', () => {
    // 2026-01-31 + 1 month -> 2026-02-28 (non-leap), via calcExpiry's clamp.
    const result = resolveRenewalExpiry({
      expiryProvided: false,
      providedExpiry: undefined,
      completionProvided: true,
      newCompletion: '2026-01-31',
      validityMonths: 1,
      existingExpiry: '2025-01-01',
    })
    expect(result).toBe('2026-02-28')
    expect(result).toBe(calcExpiry('2026-01-31', 1))
  })
})
