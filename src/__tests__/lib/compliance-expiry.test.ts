/**
 * @jest-environment node
 *
 * Unit tests for the pure expiry engine (published Phase 3 contract).
 * Deterministic: a fixed `today` is injected everywhere.
 */
import {
  calcStatus,
  calcExpiry,
  daysUntil,
  indicatorForStatus,
  DEFAULT_AMBER_DAYS,
} from '@/lib/compliance/expiry'

// Fixed reference instant used as `today` (UTC midday to expose TZ bugs).
const TODAY = new Date('2024-06-15T12:34:56Z')

describe('daysUntil', () => {
  it('returns null for null / blank / malformed dates', () => {
    expect(daysUntil(null, TODAY)).toBeNull()
    expect(daysUntil('', TODAY)).toBeNull()
    expect(daysUntil('not-a-date', TODAY)).toBeNull()
    expect(daysUntil('2024/06/15', TODAY)).toBeNull()
  })

  it('returns 0 for today regardless of the time component of now', () => {
    expect(daysUntil('2024-06-15', TODAY)).toBe(0)
    expect(daysUntil('2024-06-15', new Date('2024-06-15T00:00:00Z'))).toBe(0)
    expect(daysUntil('2024-06-15', new Date('2024-06-15T23:59:59Z'))).toBe(0)
  })

  it('counts whole future and past days', () => {
    expect(daysUntil('2024-06-16', TODAY)).toBe(1)
    expect(daysUntil('2024-06-25', TODAY)).toBe(10)
    expect(daysUntil('2024-06-14', TODAY)).toBe(-1)
    expect(daysUntil('2024-05-16', TODAY)).toBe(-30)
  })

  it('is TZ-safe across a year boundary (no off-by-one)', () => {
    const eve = new Date('2023-12-31T23:30:00Z')
    expect(daysUntil('2024-01-01', eve)).toBe(1)
    expect(daysUntil('2023-12-31', eve)).toBe(0)
  })
})

describe('calcExpiry', () => {
  it('returns null when completion is missing/invalid', () => {
    expect(calcExpiry(null, 12)).toBeNull()
    expect(calcExpiry('bad', 12)).toBeNull()
  })

  it('returns null when validity is null (never expires)', () => {
    expect(calcExpiry('2024-01-15', null)).toBeNull()
  })

  it('adds whole months (completion + 12mo)', () => {
    expect(calcExpiry('2024-01-15', 12)).toBe('2025-01-15')
    expect(calcExpiry('2024-01-15', 1)).toBe('2024-02-15')
    expect(calcExpiry('2024-06-30', 6)).toBe('2024-12-30')
  })

  it('clamps to end-of-month when the day overflows', () => {
    expect(calcExpiry('2024-01-31', 1)).toBe('2024-02-29') // leap year
    expect(calcExpiry('2023-01-31', 1)).toBe('2023-02-28') // non-leap
    expect(calcExpiry('2024-08-31', 1)).toBe('2024-09-30')
  })

  it('rolls across the year boundary', () => {
    expect(calcExpiry('2024-11-15', 3)).toBe('2025-02-15')
    expect(calcExpiry('2024-01-15', 24)).toBe('2026-01-15')
    expect(calcExpiry('2024-01-15', 36)).toBe('2027-01-15')
  })
})

describe('calcStatus', () => {
  it('null expiry is always valid (never expires)', () => {
    expect(calcStatus(null, TODAY)).toBe('valid')
  })

  it('past expiry is expired (exactly expired boundary)', () => {
    expect(calcStatus('2024-06-14', TODAY)).toBe('expired')
    expect(calcStatus('2020-01-01', TODAY)).toBe('expired')
  })

  it('within the amber window (inclusive) is expiring', () => {
    expect(calcStatus('2024-06-15', TODAY)).toBe('expiring') // 0 days
    expect(calcStatus('2024-07-15', TODAY)).toBe('expiring') // exactly 30 days (amber boundary)
    expect(DEFAULT_AMBER_DAYS).toBe(30)
  })

  it('beyond the amber window is valid', () => {
    expect(calcStatus('2024-07-16', TODAY)).toBe('valid') // 31 days
  })

  it('honors a custom amber window', () => {
    expect(calcStatus('2024-06-22', TODAY, 7)).toBe('expiring') // 7 days, amber=7
    expect(calcStatus('2024-06-23', TODAY, 7)).toBe('valid') // 8 days, amber=7
  })

  it('drives valid -> expiring -> expired as today advances', () => {
    // 12-month cert completed 2024-01-15 expires 2025-01-15.
    const expiry = calcExpiry('2024-01-15', 12)!
    expect(calcStatus(expiry, new Date('2024-06-15T00:00:00Z'))).toBe('valid')
    expect(calcStatus(expiry, new Date('2025-01-01T00:00:00Z'))).toBe('expiring')
    expect(calcStatus(expiry, new Date('2025-02-01T00:00:00Z'))).toBe('expired')
  })
})

describe('indicatorForStatus', () => {
  it('maps to traffic lights', () => {
    expect(indicatorForStatus('valid')).toBe('green')
    expect(indicatorForStatus('expiring')).toBe('amber')
    expect(indicatorForStatus('expired')).toBe('red')
  })
})
