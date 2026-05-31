// Idempotent seed for Phase 3 (compliance & certifications).
// Creates the cert types from the phase doc (§9) and assigns a mix of
// valid/expiring/expired certs to a few volunteers in the Birch tenant.
//
// SAFE TO RE-RUN: every upsert keys on a stable natural identifier so repeated
// runs converge instead of duplicating. DO NOT run this here — shipped as code
// only (conventions §4.5: additive per-phase seed, reuses the Birch tenant).
//
// Usage (not in this worktree): `pnpm tsx scripts/seed-phase-3.ts`

import { createClient } from '@supabase/supabase-js'
import { calcExpiry, calcStatus } from '@/lib/compliance/expiry'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BIRCH_SLUG = process.env.SEED_COMPANY_SLUG ?? 'birch-foundation'

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

interface SeedCertType {
  name: string
  validity_months: number | null
  required: boolean
  requires_file: boolean
  reminder_offsets: number[]
}

// Per phase doc §9.
const CERT_TYPES: SeedCertType[] = [
  { name: 'Police Check', validity_months: 36, required: true, requires_file: true, reminder_offsets: [90, 30, 7] },
  { name: 'First Aid/CPR', validity_months: 12, required: true, requires_file: true, reminder_offsets: [90, 30, 7] },
  { name: 'Working with Children', validity_months: 36, required: true, requires_file: true, reminder_offsets: [90, 30, 7] },
]

function isoOffsetDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

async function resolveCompanyId(): Promise<string | null> {
  const { data } = await admin
    .from('ess_companies')
    .select('id')
    .eq('slug', BIRCH_SLUG)
    .maybeSingle()
  return data?.id ?? null
}

async function upsertCertType(companyId: string, t: SeedCertType): Promise<string | null> {
  const { data: existing } = await admin
    .from('ess_cert_types')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', t.name)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data, error } = await admin
    .from('ess_cert_types')
    .insert({ company_id: companyId, ...t })
    .select('id')
    .single()
  if (error) {
    console.error('Failed to seed cert type', t.name, error.message)
    return null
  }
  return data.id
}

async function upsertCertification(input: {
  companyId: string
  employeeId: string
  certTypeId: string
  title: string
  validityMonths: number | null
  completionDate: string
}): Promise<void> {
  const { data: existing } = await admin
    .from('ess_certifications')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('employee_id', input.employeeId)
    .eq('cert_type_id', input.certTypeId)
    .maybeSingle()

  const expiry = calcExpiry(input.completionDate, input.validityMonths)
  const row = {
    company_id: input.companyId,
    employee_id: input.employeeId,
    cert_type_id: input.certTypeId,
    title: input.title,
    completion_date: input.completionDate,
    expiry_date: expiry,
    status: calcStatus(expiry),
  }

  if (existing?.id) {
    await admin.from('ess_certifications').update(row).eq('id', existing.id)
  } else {
    await admin.from('ess_certifications').insert(row)
  }
}

export async function seedPhase3(): Promise<void> {
  const companyId = await resolveCompanyId()
  if (!companyId) {
    console.error(`No company found for slug "${BIRCH_SLUG}"; run earlier seeds first.`)
    return
  }

  const typeIds: Array<{ id: string; type: SeedCertType }> = []
  for (const t of CERT_TYPES) {
    const id = await upsertCertType(companyId, t)
    if (id) typeIds.push({ id, type: t })
  }
  if (typeIds.length === 0) return

  const { data: employees } = await admin
    .from('ess_employees')
    .select('id, full_name')
    .eq('company_id', companyId)
    .limit(3)

  const list = employees ?? []
  if (list.length === 0) {
    // Cert types alone are still a valid idempotent seed.
    return
  }

  // Mix of statuses by choosing completion dates relative to each type's validity:
  //   valid (recent), expiring (just inside amber window), expired (past validity).
  const plans = [
    (m: number | null) => isoOffsetDays(m ? -(m * 30 - 200) : -30), // valid (far from expiry)
    (m: number | null) => isoOffsetDays(m ? -(m * 30 - 15) : -30), // expiring (within ~15 days)
    (m: number | null) => isoOffsetDays(m ? -(m * 30 + 30) : -30), // expired (past)
  ]

  for (let i = 0; i < list.length; i++) {
    const { id: certTypeId, type } = typeIds[i % typeIds.length]
    const completion = plans[i % plans.length](type.validity_months)
    await upsertCertification({
      companyId,
      employeeId: list[i].id,
      certTypeId,
      title: type.name,
      validityMonths: type.validity_months,
      completionDate: completion,
    })
  }

  console.log('Phase 3 seed complete')
}

// Allow direct invocation (NOT run in this worktree).
if (require.main === module) {
  seedPhase3()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Phase 3 seed failed', err)
      process.exit(1)
    })
}
