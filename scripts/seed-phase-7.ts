// scripts/seed-phase-7.ts
//
// Phase 7 idempotent seed (do NOT run automatically). Adds, for the Birch tenant:
//   - a reminder config (90/30/7/0 offsets, weekly, escalate to supervisor)
//   - a message template
//   - a recert mapping (First Aid expiry -> First Aid refresher module) stored on the
//     cert type's settings.recert_module_id
//
// Reuses the same Supabase service-role client pattern as other seeds. Safe to re-run:
// every write is an upsert keyed on a stable natural key.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.')
}
const db = createClient(url, serviceKey)

async function main() {
  // Resolve the Birch tenant by its stable slug.
  const { data: company } = await db.from('ess_companies').select('id').eq('slug', 'birch-foundation').single()
  if (!company) {
    console.error('Birch tenant (slug birch-foundation) not found — run base seed first.')
    return
  }
  const companyId = company.id as string

  // 1) Reminder config (idempotent on company + applies_to + subject).
  const reminderSubject = 'Your {{name}} certification expires in {{days}} days'
  const { data: existingReminder } = await db
    .from('ess_reminder_configs')
    .select('id')
    .eq('company_id', companyId)
    .eq('email_subject', reminderSubject)
    .limit(1)
  if (!existingReminder || existingReminder.length === 0) {
    await db.from('ess_reminder_configs').insert({
      company_id: companyId,
      applies_to: 'certification',
      offsets: [90, 30, 7, 0],
      frequency: 'weekly',
      email_subject: reminderSubject,
      email_body_html: '<p>Hi {{name}}, your certification expires on {{expiry}} ({{days}} days).</p>',
      escalate_to: 'supervisor',
      is_active: true,
    })
    console.log('Seeded reminder config.')
  } else {
    console.log('Reminder config already present — skipping.')
  }

  // 2) Message template (idempotent on company + name).
  const templateName = 'Welcome Announcement'
  const { data: existingTpl } = await db
    .from('ess_message_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', templateName)
    .limit(1)
  if (!existingTpl || existingTpl.length === 0) {
    await db.from('ess_message_templates').insert({
      company_id: companyId,
      name: templateName,
      subject: 'Welcome to Birch Foundation',
      body_html: '<h2>Welcome!</h2><p>We are glad to have you on the team.</p>',
    })
    console.log('Seeded message template.')
  } else {
    console.log('Message template already present — skipping.')
  }

  // 3) Recert mapping: First Aid cert type -> First Aid refresher module.
  const { data: certType } = await db
    .from('ess_cert_types')
    .select('id, name, settings')
    .eq('company_id', companyId)
    .ilike('name', '%first aid%')
    .limit(1)
  const ct = certType?.[0]
  if (ct) {
    const { data: refresher } = await db
      .from('ess_training_modules')
      .select('id, title')
      .eq('company_id', companyId)
      .ilike('title', '%first aid%')
      .limit(1)
    const moduleId = refresher?.[0]?.id
    if (moduleId) {
      const settings = { ...(ct.settings ?? {}), recert_module_id: moduleId }
      await db.from('ess_cert_types').update({ settings }).eq('id', ct.id)
      console.log('Seeded recert mapping (First Aid -> refresher module).')
    } else {
      console.log('No First Aid refresher module found — skipping recert mapping.')
    }
  } else {
    console.log('No First Aid cert type found — skipping recert mapping.')
  }

  console.log('Phase 7 seed complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
