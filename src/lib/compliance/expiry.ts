// Compliance expiry engine — pure, deterministic, TZ-safe. No DB calls.
//
// PUBLISHED CONTRACT (Phase 3): Phase 7 reminders import calcStatus/calcExpiry/
// daysUntil; Phase 2's profile widget imports calcStatus. Do NOT change these
// signatures or names — downstream phases depend on them exactly as published.

export type CertStatus = 'valid' | 'expiring' | 'expired'

/** Default amber window: a cert within this many days of expiry is 'expiring'. */
export const DEFAULT_AMBER_DAYS = 30

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

/**
 * Whole days between `today` and `date` (positive = future, negative = past).
 * UTC-safe: both sides are floored to a UTC midnight so DST / local offsets
 * never produce an off-by-one. Returns null for a null/blank/invalid date.
 */
export function daysUntil(date: string | null | undefined, today: Date = new Date()): number | null {
  if (!date || !ISO_DATE.test(date)) return null
  const target = Date.parse(date.slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(target)) return null
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.floor((target - utcToday) / 86400000)
}

/**
 * Compute an expiry date from a completion date + validity window (months).
 * - null completion OR null validityMonths -> null (never expires / unknown).
 * - otherwise completion + validityMonths months, clamped to end-of-month so e.g.
 *   2024-01-31 + 1 month yields 2024-02-29 rather than rolling into March.
 * Returns an ISO `YYYY-MM-DD` string.
 */
export function calcExpiry(
  completionDate: string | null | undefined,
  validityMonths: number | null | undefined,
): string | null {
  if (!completionDate || !ISO_DATE.test(completionDate)) return null
  if (validityMonths === null || validityMonths === undefined) return null

  const [y, m, d] = completionDate.slice(0, 10).split('-').map(Number)
  // Month index is 0-based; advance by validityMonths.
  const targetMonthIndex = m - 1 + validityMonths
  const targetYear = y + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12 // 0-based, normalized
  // Last valid day of the target month (day 0 of the next month).
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDayOfTargetMonth)

  const mm = String(targetMonth + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${targetYear}-${mm}-${dd}`
}

/**
 * Status from an expiry date, relative to `today`.
 * - null expiry -> 'valid' (never expires).
 * - daysUntil < 0 -> 'expired'.
 * - 0..amberDays inclusive -> 'expiring'.
 * - otherwise -> 'valid'.
 */
export function calcStatus(
  expiryDate: string | null | undefined,
  today: Date = new Date(),
  amberDays: number = DEFAULT_AMBER_DAYS,
): CertStatus {
  const days = daysUntil(expiryDate, today)
  if (days === null) return 'valid'
  if (days < 0) return 'expired'
  if (days <= amberDays) return 'expiring'
  return 'valid'
}

/** Map a CertStatus to a traffic-light indicator for UI reuse. */
export function indicatorForStatus(status: CertStatus): 'green' | 'amber' | 'red' {
  switch (status) {
    case 'expired':
      return 'red'
    case 'expiring':
      return 'amber'
    default:
      return 'green'
  }
}
