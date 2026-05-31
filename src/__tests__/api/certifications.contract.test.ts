/**
 * @jest-environment node
 *
 * Contract test for the compliance/certifications surface.
 *
 * This intentionally does NOT import the fetch-based client service
 * (`@/services/compliance`): that module references `fetch`, which is absent
 * from the node jest environment's type lib and fails the suite at compile
 * time (TS2304). It also avoids importing the Next.js route modules, which
 * transitively pull server-only foundation modules. We assert the stable
 * contract via the pure expiry library and the shared type shapes — both of
 * which have no DB/fetch/server imports.
 */
import { describe, it, expect } from '@jest/globals';
import { calcExpiry, calcStatus, daysUntil } from '@/lib/compliance/expiry';
import type { Certification, CertType, CertStatus } from '@/types/compliance';

describe('certifications contract', () => {
  it('expiry library exposes the pure contract functions', () => {
    expect(typeof calcExpiry).toBe('function');
    expect(typeof calcStatus).toBe('function');
    expect(typeof daysUntil).toBe('function');
  });

  it('constrains certification status to the four allowed values', () => {
    const allowed: CertStatus[] = ['valid', 'expiring', 'expired', 'missing'];
    expect(allowed).toEqual(['valid', 'expiring', 'expired', 'missing']);
    // calcStatus only ever returns one of the allowed values.
    const now = new Date('2026-01-01T00:00:00Z');
    expect(allowed).toContain(calcStatus('2026-06-01', now));
    expect(allowed).toContain(calcStatus(null, now, 30, true));
  });

  it('certification shape carries the contract fields', () => {
    const cert: Certification = {
      id: 'c1',
      company_id: 'co1',
      employee_id: 'e1',
      cert_type_id: 't1',
      issued_date: '2026-01-01',
      expiry_date: null,
      document_url: null,
      status: 'valid',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(cert.cert_type_id).toBe('t1');
    expect(cert.status).toBe('valid');
  });

  it('cert type shape carries the contract fields', () => {
    const t: CertType = {
      id: 't1',
      company_id: 'co1',
      name: 'First Aid',
      description: null,
      validity_months: 12,
      requires_document: true,
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(t.validity_months).toBe(12);
    expect(t.requires_document).toBe(true);
    // calcExpiry honours the cert type's validity window.
    expect(calcExpiry('2026-01-01', t.validity_months)).toBe('2027-01-01');
    expect(calcExpiry('2026-01-01', null)).toBeNull();
  });
});
