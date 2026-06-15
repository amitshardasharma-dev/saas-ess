/**
 * @jest-environment node
 *
 * Contract test for the compliance / certifications surface.
 *
 * This intentionally does NOT import the fetch-based client service
 * (`@/services/compliance`): that module references `fetch`, which is absent
 * from the node jest environment's type lib and fails the suite at compile
 * time (TS2304: Cannot find name 'fetch'). It also avoids importing the
 * Next.js route modules (which transitively pull server-only modules). We
 * assert the stable PUBLISHED contract via the pure expiry library
 * (calcExpiry / calcStatus / daysUntil) and the shared compliance type shapes
 * — none of which import fetch, a DB client, or server-only code. No DOM lib
 * hack is used.
 */
import { calcExpiry, calcStatus, daysUntil, indicatorForStatus } from '@/lib/compliance/expiry'
import type { CertStatus } from '@/lib/compliance/expiry'
import type { Certification, CertType, CertHistoryAction } from '@/types/compliance'

describe('certifications contract', () => {
  it('exposes the pure expiry contract functions', () => {
    expect(typeof calcExpiry).toBe('function')
    expect(typeof calcStatus).toBe('function')
    expect(typeof daysUntil).toBe('function')
  })

  it('calcExpiry adds the validity window and is null when never-expiring', () => {
    expect(calcExpiry('2026-01-15', 12)).toBe('2027-01-15')
    expect(calcExpiry('2026-01-31', 1)).toBe('2026-02-28') // clamps to month end
    expect(calcExpiry('2026-01-15', null)).toBeNull()
    expect(calcExpiry(null, 12)).toBeNull()
  })

  it('calcStatus maps an injected today onto the published status enum', () => {
    const today = new Date('2026-01-01T00:00:00Z')
    const allowed: CertStatus[] = ['valid', 'expiring', 'expired']
    expect(calcStatus(null, today)).toBe('valid') // never expires
    expect(calcStatus('2025-12-01', today)).toBe('expired') // past
    expect(calcStatus('2026-01-20', today)).toBe('expiring') // within 30d amber window
    expect(calcStatus('2026-06-01', today)).toBe('valid') // far future
    expect(allowed).toContain(calcStatus('2026-06-01', today))
  })

  it('amber boundary is inclusive at exactly the amber window', () => {
    const today = new Date('2026-01-01T00:00:00Z')
    expect(calcStatus('2026-01-31', today, 30)).toBe('expiring') // exactly 30 days
    expect(calcStatus('2026-02-01', today, 30)).toBe('valid') // 31 days
    expect(calcStatus('2025-12-31', today, 30)).toBe('expired') // 1 day past
  })

  it('daysUntil is UTC-safe and null for blank/invalid input', () => {
    const today = new Date('2026-01-01T00:00:00Z')
    expect(daysUntil('2026-01-11', today)).toBe(10)
    expect(daysUntil('2025-12-22', today)).toBe(-10)
    expect(daysUntil(null, today)).toBeNull()
    expect(daysUntil('not-a-date', today)).toBeNull()
  })

  it('indicatorForStatus maps the enum to traffic-light colors', () => {
    expect(indicatorForStatus('valid')).toBe('green')
    expect(indicatorForStatus('expiring')).toBe('amber')
    expect(indicatorForStatus('expired')).toBe('red')
  })

  it('Certification shape carries the published contract fields', () => {
    const status: CertStatus = 'valid'
    const cert: Certification = {
      id: 'c1',
      company_id: 'co1',
      employee_id: 'e1',
      cert_type_id: 't1',
      title: 'First Aid',
      status,
      verification_status: 'validated',
      verified_by: null,
      verified_at: null,
      completion_date: '2026-01-01',
      expiry_date: '2027-01-01',
      file_url: null,
      file_name: null,
      notes: null,
      created_by: 'e0',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(cert.cert_type_id).toBe('t1')
    expect(cert.status).toBe('valid')
  })

  it('CertType shape carries validity + reminder-offset contract fields', () => {
    const t: CertType = {
      id: 't1',
      company_id: 'co1',
      name: 'First Aid',
      validity_months: 12,
      requires_file: true,
      required: true,
      reminder_offsets: [90, 30, 7],
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(t.validity_months).toBe(12)
    expect(t.reminder_offsets).toEqual([90, 30, 7])
    // calcExpiry honours the cert type's validity window.
    expect(calcExpiry('2026-01-01', t.validity_months)).toBe('2027-01-01')
  })

  it('CertHistoryAction admits the published action set', () => {
    const actions: CertHistoryAction[] = [
      'created',
      'renewed',
      'expired',
      'revoked',
      'recertified',
    ]
    expect(actions).toHaveLength(5)
  })
})
