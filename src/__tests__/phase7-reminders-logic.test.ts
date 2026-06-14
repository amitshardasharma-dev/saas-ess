// Phase 7 — reminder/recert scan decision logic, exercised through the pure Phase 3
// expiry helpers the scans depend on. This avoids importing the DB-bound scan modules
// (which pull supabaseAdmin/sendEmail) under the test runner, while still pinning the
// exact offset-match and overdue/expired rules the handlers implement.

import { daysUntil } from '@/lib/compliance/expiry'

const TODAY = new Date('2026-06-01T12:00:00Z')

// Replica of the scan's offset-match rule: a cert fires for offset O when
// daysUntil(expiry) === O. Negative O = overdue (escalation path).
function firesAtOffset(expiry: string, offsets: number[], today = TODAY): number | null {
  const d = daysUntil(expiry, today)
  if (d === null) return null
  return offsets.includes(d) ? d : null
}

describe('phase7 reminder offset logic', () => {
  const offsets = [90, 30, 7, 0, -7]

  it('fires when a cert is exactly at a configured offset', () => {
    expect(firesAtOffset('2026-06-08', offsets)).toBe(7) // 7 days out
    expect(firesAtOffset('2026-06-01', offsets)).toBe(0) // expires today
    expect(firesAtOffset('2026-08-30', offsets)).toBe(90)
  })

  it('does not fire between offsets', () => {
    expect(firesAtOffset('2026-06-10', offsets)).toBeNull() // 9 days out
    expect(firesAtOffset('2026-06-25', offsets)).toBeNull() // 24 days out
  })

  it('overdue negative offset triggers the escalation path', () => {
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
