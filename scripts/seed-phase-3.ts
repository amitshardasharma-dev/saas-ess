/**
 * Seed script for Phase 3 — Compliance & Certifications.
 *
 * Seeds 3 certification types and ~8 certifications across employees with
 * varied expiry windows (valid / expiring / expired). Guarded by a company
 * existence check: if no company is found the script exits without writing.
 *
 * Usage: npx tsx scripts/seed-phase-3.ts
 * (Code-only in this worktree — not executed against a live DB here.)
 */
import { createServiceClient } from '@/lib/supabase/service';
import { calcExpiry, calcStatus } from '@/lib/compliance/expiry';
import type { CertStatus } from '@/types/compliance';

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const supabase = createServiceClient();

  // Guard: only seed when a company exists.
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (!company) {
    // eslint-disable-next-line no-console
    console.log('[seed-phase-3] no company found — skipping seed.');
    return;
  }
  const companyId: string = company.id;

  // Employees to attach certifications to.
  const { data: employees } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .limit(4);
  const employeeIds: string[] = (employees ?? []).map((e: { id: string }) => e.id);
  if (employeeIds.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[seed-phase-3] no employees found — skipping seed.');
    return;
  }

  // 3 cert types: one expiring annually, one biennial, one that never expires.
  const certTypeDefs = [
    { name: 'First Aid Certificate', description: 'Workplace first aid', validity_months: 12, requires_document: true },
    { name: 'Fire Safety Training', description: 'Fire warden training', validity_months: 24, requires_document: false },
    { name: 'Code of Conduct Acknowledgement', description: 'Annual policy sign-off', validity_months: null, requires_document: false },
  ];

  const certTypeIds: { id: string; validity_months: number | null }[] = [];
  for (const def of certTypeDefs) {
    const { data } = await supabase
      .from('cert_types')
      .insert({ company_id: companyId, ...def })
      .select('id, validity_months')
      .single();
    if (data) certTypeIds.push({ id: data.id, validity_months: data.validity_months });
  }

  // ~8 certifications with varied issued dates -> valid / expiring / expired.
  // Offsets (days from today) chosen so calcExpiry lands in each bucket.
  const now = new Date();
  const issuedOffsets = [-30, -350, -400, -700, -800, -10, -360, -5];
  let made = 0;
  for (let i = 0; i < 8; i++) {
    const employeeId = employeeIds[i % employeeIds.length];
    const certType = certTypeIds[i % certTypeIds.length];
    if (!certType) break;
    const issuedDate = isoDaysFromNow(issuedOffsets[i]);
    const expiry = calcExpiry(issuedDate, certType.validity_months);
    const status: CertStatus = calcStatus(expiry, now, 30, certType.validity_months !== null);
    const { error } = await supabase.from('certifications').insert({
      company_id: companyId,
      employee_id: employeeId,
      cert_type_id: certType.id,
      issued_date: issuedDate,
      expiry_date: expiry,
      document_url: null,
      status,
    });
    if (!error) made++;
  }

  // eslint-disable-next-line no-console
  console.log(`[seed-phase-3] seeded ${certTypeIds.length} cert types and ${made} certifications.`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-phase-3] failed:', err);
  process.exit(1);
});
