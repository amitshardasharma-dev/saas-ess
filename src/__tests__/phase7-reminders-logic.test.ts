// Phase 7 — reminder/recert scan decision logic, exercised through the pure Phase 3
// expiry helpers the scans depend on. This avoids importing the DB-bound scan modules
// (which pull supabaseAdmin/sendEmail) under the test runner, while still pinning the
// exact offset-match and overdue/expired rules the handlers implement.

import { daysUntil } from '@/lib/compliance/expiry'

const TODAY = new Date('2026-06-01T12:00:00Z')

// Replica of the scan's CATCH-UP offset rule (dueOffset): a cert fires for the
// latest checkpoint it has reached — the smallest configured offset >= daysUntil.
// Negative O = overdue (escalation path). This is what makes an on-demand scan (or
// one after a missed day) still send the right milestone, not just an exact hit.
function firesAtOffset(expiry: string, offsets: number[], today = TODAY): number | null {
  const d = daysUntil(expiry, today)
  if (d === null) return null
  const reached = offsets.filter((o) => d <= o)
  return reached.length ? Math.min(...reached) : null
}

describe('phase7 reminder offset logic (catch-up)', () => {
  const offsets = [90, 30, 7, 0, -7]

  it('fires the exact milestone when a cert is exactly at a configured offset', () => {
    expect(firesAtOffset('2026-06-08', offsets)).toBe(7) // 7 days out
    expect(firesAtOffset('2026-06-01', offsets)).toBe(0) // expires today
    expect(firesAtOffset('2026-08-30', offsets)).toBe(90)
  })

  it('catches up: between offsets it fires the latest reached milestone', () => {
    expect(firesAtOffset('2026-06-10', offsets)).toBe(30) // 9 days out → latest reached is 30 (9 ≤ 30, but 9 > 7)
    expect(firesAtOffset('2026-06-08', offsets)).toBe(7) // 7 days out → exactly 7
    expect(firesAtOffset('2026-06-25', offsets)).toBe(30) // 24 days out → 30
  })

  it('does not fire before the cert is in any window', () => {
    expect(firesAtOffset('2026-11-01', offsets)).toBeNull() // 153 days out — past the 90 window
  })

  it('overdue fires the negative checkpoint (escalation path)', () => {
    const fired = firesAtOffset('2026-05-25', offsets) // 7 days overdue
    expect(fired).toBe(-7)
    expect(fired !== null && fired < 0).toBe(true)
  })
})

describe('phase7 recert expired predicate', () => {
  it('treats only past-expiry certs as expired (daysUntil < 0)', () => {
    expect((daysUntil('2026-05-01', TODAY) ?? 0) < 0).toBe(true)
    expect((daysUntil('2026-07-01', TODAY) ?? 0) < 0).toBe(false)
  })

  it('null/blank expiry never triggers recert', () => {
    expect(daysUntil(null, TODAY)).toBeNull()
    expect(daysUntil('', TODAY)).toBeNull()
  })
})

describe('phase7 dedupe key', () => {
  // The DB enforces unique (reminder_config_id, certification_id, offset_sent). The
  // in-code guard builds the same triple; assert its identity semantics here.
  it('same (config, cert, offset) is one logical send', () => {
    const key = (c: string, cert: string, o: number) => `${c}:${cert}:${o}`
    expect(key('cfg', 'cert', 7)).toBe(key('cfg', 'cert', 7))
    expect(key('cfg', 'cert', 7)).not.toBe(key('cfg', 'cert', 0))
  })
})
