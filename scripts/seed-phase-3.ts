/**
 * Seed script for Phase 3 — Compliance & Certifications.
 *
 * Seeds the spec §9 cert types (Police Check 36mo, First Aid/CPR 12mo, Working
 * with Children 36mo) plus several certifications across employees with a mix of
 * valid / expiring / expired expiry windows.
 *
 * Guarded: if no company or no employees are found it exits without writing, so
 * it is safe to run repeatedly / against an empty environment.
 *
 * Usage: npx tsx scripts/seed-phase-3.ts
 * (Code-only in this worktree — NOT executed against a live DB here.)
 */
import { supabaseAdmin } from '@/lib/supabase-server'
import { calcExpiry, calcStatus } from '@/lib/compliance/expiry'

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  // Guard: only seed when a company exists.
  const { data: company } = await supabaseAdmin
    .from('ess_companies')
    .select('id')
    .limit(1)
    .maybeSingle()
  if (!company) {
    // eslint-disable-next-line no-console
    console.log('[seed-phase-3] no company found — skipping seed.')
    return
  }
  const companyId: string = company.id

  // Employees to attach certifications to.
  const { data: employees } = await supabaseAdmin
    .from('ess_employees')
    .select('id')
    .eq('company_id', companyId)
    .limit(4)
  const employeeIds: string[] = (employees ?? []).map((e: { id: string }) => e.id)
  if (employeeIds.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[seed-phase-3] no employees found — skipping seed.')
    return
  }

  // Spec §9 cert types.
  const certTypeDefs = [
    { name: 'Police Check', validity_months: 36, requires_file: true, required: true, reminder_offsets: [90, 30, 7] },
    { name: 'First Aid/CPR', validity_months: 12, requires_file: true, required: true, reminder_offsets: [90, 30, 7] },
    { name: 'Working with Children', validity_months: 36, requires_file: true, required: false, reminder_offsets: [90, 30, 7] },
  ]

  const certTypeIds: { id: string; validity_months: number | null }[] = []
  for (const def of certTypeDefs) {
    const { data } = await supabaseAdmin
      .from('ess_cert_types')
      .insert({ company_id: companyId, ...def })
      .select('id, validity_months')
      .single()
    if (data) certTypeIds.push({ id: data.id, validity_months: data.validity_months })
  }

  // Certifications with varied completion dates -> valid / expiring / expired.
  // Offsets (days from today) chosen so calcExpiry lands across the buckets.
  const now = new Date()
  const completionOffsets = [-30, -360, -370, -1080, -1100, -10, -395, -5]
  let made = 0
  for (let i = 0; i < completionOffsets.length; i++) {
    const employeeId = employeeIds[i % employeeIds.length]
    const certType = certTypeIds[i % certTypeIds.length]
    if (!certType) break
    const completion = isoDaysFromNow(completionOffsets[i])
    const expiry = calcExpiry(completion, certType.validity_months)
    const status = calcStatus(expiry, now)
    const { error } = await supabaseAdmin.from('ess_certifications').insert({
      company_id: companyId,
      employee_id: employeeId,
      cert_type_id: certType.id,
      title: certTypeDefs[i % certTypeDefs.length].name,
      completion_date: completion,
      expiry_date: expiry,
      status,
      created_by: employeeId,
    })
    if (!error) made++
  }

  // eslint-disable-next-line no-console
  console.log(`[seed-phase-3] seeded ${certTypeIds.length} cert types and ${made} certifications.`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-phase-3] failed:', err)
  process.exit(1)
})
