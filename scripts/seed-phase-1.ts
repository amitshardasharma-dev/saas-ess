// scripts/seed-phase-1.ts
//
// Phase 1 seed: Birch Foundation tenant configuration.
//   - Applies Birch terminology overrides (ess_tenant_labels).
//   - Enables Birch's MVP modules (ess_companies.settings.modules_enabled),
//     respecting the dependency graph.
//
// Idempotent (upserts). Reuses the Birch tenant by slug 'birch-foundation'.
// Usage: pnpm tsx scripts/seed-phase-1.ts
// CODE/SEED ONLY — do not run against a live DB as part of Phase 1 delivery.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const BIRCH_SLUG = process.env.BIRCH_SLUG ?? 'birch-foundation'

// Birch terminology (term_key -> singular/plural).
const BIRCH_LABELS = [
  { term_key: 'person', singular: 'Volunteer', plural: 'Volunteers' },
  { term_key: 'supervisor', singular: 'Coordinator', plural: 'Coordinators' },
  { term_key: 'org_unit', singular: 'Program', plural: 'Programs' },
  { term_key: 'certification', singular: 'Certification', plural: 'Certifications' },
  { term_key: 'training_module', singular: 'Training Module', plural: 'Training Modules' },
  { term_key: 'document', singular: 'Document', plural: 'Documents' },
]

// Birch MVP modules. Dependencies satisfied: quizzes/training_tracking -> training;
// expiry_reminders -> compliance; recertification -> training + compliance.
const BIRCH_MODULES = [
  'leave',
  'documents',
  'profiles',
  'documents_esign',
  'communications',
  'training',
  'quizzes',
  'training_tracking',
  'reporting',
  'compliance',
  'expiry_reminders',
  'recertification',
]

async function main() {
  const { data: company, error: companyErr } = await supabase
    .from('ess_companies')
    .select('id, settings')
    .eq('slug', BIRCH_SLUG)
    .single()

  if (companyErr || !company) {
    throw new Error(`Birch company (slug "${BIRCH_SLUG}") not found. Create it first.`)
  }
  const companyId = company.id

  // Terminology
  for (const label of BIRCH_LABELS) {
    const { error } = await supabase
      .from('ess_tenant_labels')
      .upsert({ company_id: companyId, ...label }, { onConflict: 'company_id,term_key' })
    if (error) throw error
  }
  console.log(`Seeded ${BIRCH_LABELS.length} terminology overrides for Birch (${companyId})`)

  // Modules (merge into settings JSON)
  const settings = { ...((company.settings as Record<string, unknown>) || {}), modules_enabled: BIRCH_MODULES }
  const { error: modErr } = await supabase
    .from('ess_companies')
    .update({ settings })
    .eq('id', companyId)
  if (modErr) throw modErr
  console.log(`Enabled ${BIRCH_MODULES.length} modules for Birch`)

  console.log('Phase 1 seed complete.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
