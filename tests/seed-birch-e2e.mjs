// Seed the DISPOSABLE `birch-e2e` tenant for the Ralph E2E triage loop.
// NEVER touches `birch-foundation`. Idempotent: re-running refreshes the tenant.
// Run: node tests/seed-birch-e2e.mjs   (reads .env.local for the service key)
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
const ge = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : '' }
const sb = createClient(ge('NEXT_PUBLIC_SUPABASE_URL'), ge('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const SLUG = 'birch-e2e'
const PASSWORD = 'E2ePass123!'
const MODULES = ['profiles','documents','documents_esign','communications','training','quizzes','training_tracking','reporting','compliance','expiry_reminders','recertification']
const SOURCE_BUCKET = 'ess-documents'
const SIGNED_BUCKET = 'signed-documents'

const USERS = [
  // Realistic, authentic Birch Foundation people (Gold Coast DV/homelessness
  // charity). The stable KEYS are what the E2E specs reference — names are free.
  { key: 'superadmin', email: 'superadmin@birch-e2e.test', name: 'Olivia Bennett',     role: 'admin', superAdmin: true,  dept: 'Management' },
  { key: 'admin',      email: 'admin@birch-e2e.test',      name: 'Margaret Whitfield', role: 'admin', superAdmin: false, dept: 'Management' },
  { key: 'staff',      email: 'staff@birch-e2e.test',      name: 'David Okoro',        role: 'hr',    superAdmin: false, dept: 'Volunteer Coordination' },
  { key: 'volOutreach',email: 'vol.outreach@birch-e2e.test',name:'Aisha Rahman',       role: 'employee', superAdmin: false, dept: 'Street Outreach' },
  { key: 'volOpshop',  email: 'vol.opshop@birch-e2e.test', name: 'Tom Bennett',        role: 'employee', superAdmin: false, dept: 'Op Shop & Cafe' },
  // Dedicated to the onboarding auto-complete gate spec (mutated heavily). Kept
  // separate so volOutreach/volOpshop stay pristine for the other specs.
  { key: 'volAuto',    email: 'vol.auto@birch-e2e.test',   name: 'Liam Carter',        role: 'employee', superAdmin: false, dept: 'Street Outreach' },
  // Additional demo people (no spec dependency) — for a populated, authentic org.
  { key: 'staff2',     email: 'hannah.lee@birch-e2e.test',     name: 'Hannah Lee',      role: 'hr',       superAdmin: false, dept: 'Family Support' },
  { key: 'vol4',       email: 'priya.nair@birch-e2e.test',     name: 'Priya Nair',      role: 'employee', superAdmin: false, dept: 'Family Support' },
  { key: 'vol5',       email: 'noah.williams@birch-e2e.test',  name: 'Noah Williams',   role: 'employee', superAdmin: false, dept: 'Crisis Accommodation' },
  { key: 'vol6',       email: 'sofia.martinez@birch-e2e.test', name: 'Sofia Martinez',  role: 'employee', superAdmin: false, dept: 'Op Shop & Cafe' },
  { key: 'vol7',       email: 'ethan.nguyen@birch-e2e.test',   name: 'Ethan Nguyen',    role: 'employee', superAdmin: false, dept: 'Fundraising & Events' },
  { key: 'vol8',       email: 'grace.thompson@birch-e2e.test', name: 'Grace Thompson',  role: 'employee', superAdmin: false, dept: 'Street Outreach' },
  { key: 'vol9',       email: 'daniel.cohen@birch-e2e.test',   name: 'Daniel Cohen',    role: 'employee', superAdmin: false, dept: 'Crisis Accommodation' },
]
// Volunteer keys used for the demo dataset + onboarding instantiation.
const VOL_KEYS = ['volOutreach', 'volOpshop', 'volAuto', 'vol4', 'vol5', 'vol6', 'vol7', 'vol8', 'vol9']

const CERT_TYPES = [
  ['National Police Check',36,true,true,[90,30,7,0]],
  ['Blue Card (Working With Children)',36,true,true,[90,30,7,0]],
  ['First Aid Certificate (HLTAID011)',36,true,false,[90,30,7,0]],
  ['CPR (HLTAID009)',12,true,false,[60,30,7,0]],
  ['Food Safety (Handling)',60,true,false,[90,30,0]],
  ['Manual Handling / WHS Induction',12,false,false,[30,7,0]],
  ['NDIS Worker Screening',60,true,false,[90,30,0]],
]
// [title, description, requires_ack, body_markdown?]
const AGREEMENT_MD = `# Volunteer Agreement

Thank you for volunteering with **Birch Foundation**. By signing below you agree to:

1. Act with care, respect and integrity toward the people we support.
2. Maintain the confidentiality of all client and organisational information.
3. Follow Birch Foundation policies, including our Child-Safe & Safeguarding Policy.
4. Attend agreed shifts and notify your coordinator of any absence.
5. Complete all required training and keep your certifications current.

This agreement is entered into voluntarily and may be ended by either party at any time.`
const CONDUCT_MD = `# Code of Conduct

As a Birch Foundation volunteer you will:

- Treat everyone with dignity, respect and without discrimination.
- Maintain professional boundaries with clients and staff.
- Protect confidential and personal information at all times.
- Report any safety or safeguarding concern immediately.
- Never attend a shift under the influence of alcohol or drugs.

Breaches of this code may result in your volunteer role ending.`
const SAFEGUARDING_MD = `# Child-Safe & Safeguarding Policy

Birch Foundation is committed to the safety and wellbeing of children and vulnerable people.

- We have **zero tolerance** for abuse or neglect of any kind.
- All volunteers must hold a current Working With Children (Blue Card) and National Police Check.
- Any concern about a child's safety must be reported to your coordinator and the relevant authority.
- Volunteers must complete Safeguarding training before working unsupervised.

By acknowledging this policy you confirm you have read and understood it.`
const DOCS = [
  ['Volunteer Agreement','Volunteer terms and commitment',false, AGREEMENT_MD],
  ['Code of Conduct','Expected standards of behaviour',false, CONDUCT_MD],
  ['Confidentiality & Privacy Agreement','Handling sensitive information',false],
  ['Child-Safe & Safeguarding Policy','Our commitment to safety',true, SAFEGUARDING_MD],
  ['Photo & Media Consent','Consent for use of images',false],
  ['WHS Policy','Work health & safety',true],
]
const MODULES_T = [
  'Volunteer Induction','Safeguarding & Child-Safe','DV & Trauma-Informed Awareness',
  'WHS & Manual Handling','Food Safety Basics','Privacy & Confidentiality',
]

// Typed/linked onboarding template (blueprint §3.5 + §6). Each step references a
// real artifact so completing the action auto-completes the step. ref filled in
// after the artifacts are created (see buildTypedSteps).
const STEP_DEFS = [
  { title: 'Complete your profile', description: 'Add contact details and emergency contact.', step_type: 'profile_field', auto_complete: false, ref_kind: null, ref: null },
  { title: 'Sign the Volunteer Agreement', description: 'Read and digitally sign your volunteer agreement.', step_type: 'doc_sign', auto_complete: true, ref_kind: 'document', ref: ['doc', 'Volunteer Agreement'] },
  { title: 'Sign the Code of Conduct', description: 'Review and sign the Birch Foundation Code of Conduct.', step_type: 'doc_sign', auto_complete: true, ref_kind: 'document', ref: ['doc', 'Code of Conduct'] },
  { title: 'Acknowledge the Safeguarding Policy', description: 'Confirm you have read the Child-Safe & Safeguarding Policy.', step_type: 'doc_ack', auto_complete: true, ref_kind: 'document', ref: ['doc', 'Child-Safe & Safeguarding Policy'] },
  { title: 'Upload your National Police Check', description: 'Upload a current National Police Certificate.', step_type: 'certification', auto_complete: true, ref_kind: 'cert_type', ref: ['cert', 'National Police Check'] },
  { title: 'Upload your Blue Card', description: 'Upload your QLD Working With Children (Blue Card).', step_type: 'certification', auto_complete: true, ref_kind: 'cert_type', ref: ['cert', 'Blue Card (Working With Children)'] },
  { title: 'Complete Volunteer Induction training', description: 'Watch the induction and complete the short quiz.', step_type: 'training', auto_complete: true, ref_kind: 'training_module', ref: ['mod', 'Volunteer Induction'] },
  { title: 'Complete Safeguarding training', description: 'Complete the safeguarding module and quiz.', step_type: 'training', auto_complete: true, ref_kind: 'training_module', ref: ['mod', 'Safeguarding & Child-Safe'] },
  { title: 'Induction meeting with coordinator', description: 'Attend your induction meeting (marked by staff).', step_type: 'manual', auto_complete: false, ref_kind: null, ref: null },
]

async function ensureAuthUser(email) {
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (existing) { await sb.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true }); return existing.id }
  const { data, error } = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`)
  return data.user.id
}

async function ensureBucket(id, isPublic) {
  const { data: existing } = await sb.storage.getBucket(id)
  if (existing) return
  const { error } = await sb.storage.createBucket(id, { public: isPublic })
  if (error && !/already exists/i.test(error.message)) throw new Error(`bucket ${id}: ${error.message}`)
}

async function makePdf(text) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText(text, { x: 60, y: 760, size: 16, font })
  page.drawText('Signature: ____________________', { x: 60, y: 120, size: 12, font })
  return Buffer.from(await pdf.save())
}

async function main() {
  // 1. company
  let { data: company } = await sb.from('ess_companies').select('id').eq('slug', SLUG).maybeSingle()
  if (!company) {
    const { data, error } = await sb.from('ess_companies').insert({
      name: 'Birch E2E', slug: SLUG, plan: 'enterprise', status: 'active', max_users: 250, max_storage_mb: 10000,
      settings: { modules_enabled: MODULES },
    }).select('id').single()
    if (error) throw new Error('company: ' + error.message)
    company = data
  } else {
    await sb.from('ess_companies').update({ settings: { modules_enabled: MODULES }, max_users: 250 }).eq('id', company.id)
  }
  const cid = company.id
  console.log('company birch-e2e:', cid)

  // 2. users -> app_user + employee
  const fixtures = { companyId: cid, password: PASSWORD, users: {} }
  let n = 1
  for (const u of USERS) {
    const auth = await ensureAuthUser(u.email)
    let { data: au } = await sb.from('ess_app_users').select('id').eq('auth_user_id', auth).maybeSingle()
    if (au) {
      await sb.from('ess_app_users').update({ company_id: cid, role: u.role, is_super_admin: u.superAdmin, is_active: true }).eq('id', au.id)
    } else {
      const { data, error } = await sb.from('ess_app_users').insert({ auth_user_id: auth, company_id: cid, role: u.role, is_super_admin: u.superAdmin, is_active: true }).select('id').single()
      if (error) throw new Error('app_user ' + u.email + ': ' + error.message)
      au = data
    }
    let { data: emp } = await sb.from('ess_employees').select('id').eq('app_user_id', au.id).maybeSingle()
    if (emp) {
      await sb.from('ess_employees').update({ full_name: u.name, email: u.email, department: u.dept }).eq('id', emp.id)
    } else {
      const { data, error } = await sb.from('ess_employees').insert({ app_user_id: au.id, company_id: cid, full_name: u.name, email: u.email, employee_no: `E2E-${String(n).padStart(3,'0')}`, department: u.dept }).select('id').single()
      if (error) throw new Error('employee ' + u.email + ': ' + error.message)
      emp = data
    }
    fixtures.users[u.key] = { email: u.email, role: u.role, isSuperAdmin: u.superAdmin, appUserId: au.id, employeeId: emp.id, department: u.dept }
    n++
  }
  const adminEmp = fixtures.users.admin.employeeId

  // 3. master data — clean child rows first (FKs), then reseed.
  await sb.from('ess_onboarding_steps').delete().eq('company_id', cid) // template + instances
  await sb.from('ess_onboarding_states').delete().eq('company_id', cid)
  await sb.from('ess_onboarding_templates').delete().eq('company_id', cid)
  await sb.from('ess_cert_types').delete().eq('company_id', cid)
  await sb.from('ess_reminder_configs').delete().eq('company_id', cid)
  await sb.from('ess_message_templates').delete().eq('company_id', cid)
  // Wipe any prior messages (incl. accumulated E2E test sends) + their children.
  {
    const { data: oldMsgs } = await sb.from('ess_messages').select('id').eq('company_id', cid)
    const oldIds = (oldMsgs ?? []).map((m) => m.id)
    if (oldIds.length) {
      await sb.from('ess_message_recipients').delete().in('message_id', oldIds)
      await sb.from('ess_message_targets').delete().in('message_id', oldIds)
    }
    await sb.from('ess_messages').delete().eq('company_id', cid)
  }
  // Demo dataset tables (reseeded fresh below).
  await sb.from('ess_reminder_sends').delete().eq('company_id', cid)
  await sb.from('ess_recertifications').delete().eq('company_id', cid) // cascades recert_history
  await sb.from('ess_certifications').delete().eq('company_id', cid)   // cascades cert messages + history
  await sb.from('ess_training_item_progress').delete().eq('company_id', cid)
  await sb.from('ess_training_progress').delete().eq('company_id', cid)
  await sb.from('ess_compliance_requirements').delete().eq('company_id', cid)
  await sb.from('ess_training_assignments').delete().eq('company_id', cid)
  await sb.from('ess_training_items').delete().eq('company_id', cid)
  await sb.from('ess_training_modules').delete().eq('company_id', cid)
  await sb.from('ess_document_fields').delete().eq('company_id', cid)
  // versions/acknowledgments cascade from documents
  await sb.from('ess_documents').delete().eq('company_id', cid)

  // 3a. cert types (capture ids by name)
  const { data: certRows, error: certErr } = await sb.from('ess_cert_types')
    .insert(CERT_TYPES.map(([name, vm, rf, req, off]) => ({ company_id: cid, name, validity_months: vm, requires_file: rf, required: req, reminder_offsets: off })))
    .select('id, name')
  if (certErr) throw new Error('cert_types: ' + certErr.message)
  const certByName = Object.fromEntries(certRows.map((c) => [c.name, c.id]))

  // 3b. documents (capture ids by title)
  const { data: docRows, error: docErr } = await sb.from('ess_documents')
    .insert(DOCS.map(([title, description, ack, md]) => ({ company_id: cid, title, description, body_markdown: md ?? null, is_published: true, requires_acknowledgment: ack, published_at: new Date().toISOString(), created_by: adminEmp })))
    .select('id, title')
  if (docErr) throw new Error('documents: ' + docErr.message)
  const docByName = Object.fromEntries(docRows.map((d) => [d.title, d.id]))

  // 3c. document versions + (for e-sign docs) a source PDF in storage + a
  //     signature field. doc_ack docs only need a version row.
  await ensureBucket(SOURCE_BUCKET, true)
  await ensureBucket(SIGNED_BUCKET, false)
  const versionByDoc = {}
  const SIGN_DOCS = ['Volunteer Agreement', 'Code of Conduct']
  const VERSIONED_DOCS = [...SIGN_DOCS, 'Child-Safe & Safeguarding Policy', 'WHS Policy']
  for (const title of VERSIONED_DOCS) {
    const docId = docByName[title]
    const path = `${cid}/${docId}/v1.pdf`
    const pdf = await makePdf(`${title} — Birch E2E`)
    const { error: upErr } = await sb.storage.from(SOURCE_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw new Error(`upload ${title}: ${upErr.message}`)
    const { data: ver, error: verErr } = await sb.from('ess_document_versions')
      .insert({ document_id: docId, version_number: 1, file_url: path, file_name: `${title}.pdf`, file_size: pdf.length, uploaded_by: adminEmp })
      .select('id').single()
    if (verErr) throw new Error(`version ${title}: ${verErr.message}`)
    versionByDoc[title] = ver.id
    if (SIGN_DOCS.includes(title)) {
      const { error: fErr } = await sb.from('ess_document_fields').insert({
        company_id: cid, document_id: docId, version_id: ver.id, field_key: 'signature',
        label: 'Signature', type: 'signature', required: true, page: 1,
        x_ratio: 0.2, y_ratio: 0.85, width_ratio: 0.3, height_ratio: 0.04, sort_order: 0,
      })
      if (fErr) throw new Error(`field ${title}: ${fErr.message}`)
    }
  }

  // 3d. training modules (capture ids by title)
  const { data: modRows, error: modErr } = await sb.from('ess_training_modules')
    .insert(MODULES_T.map((title) => ({ company_id: cid, title, description: title, status: 'published', created_by: null })))
    .select('id, title')
  if (modErr) throw new Error('modules: ' + modErr.message)
  const modByName = Object.fromEntries(modRows.map((m) => [m.title, m.id]))

  // 3e. training items + assignments for the two onboarding-linked modules.
  //     Induction = video + document + quiz (the §gate "video ack + doc ack +
  //     pass quiz"); Safeguarding = a single video. All items required so the
  //     module only reaches 100% when every one is completed.
  const inductionId = modByName['Volunteer Induction']
  const safeguardingId = modByName['Safeguarding & Child-Safe']
  const whsDocId = docByName['WHS Policy']
  const { data: indItems, error: indErr } = await sb.from('ess_training_items').insert([
    { company_id: cid, module_id: inductionId, type: 'video', title: 'Induction video', video_url: 'https://example.test/induction.mp4', required: true, sort_order: 0 },
    { company_id: cid, module_id: inductionId, type: 'document', title: 'Induction handbook', document_id: whsDocId, required: true, sort_order: 1 },
    { company_id: cid, module_id: inductionId, type: 'quiz', title: 'Induction quiz', quiz_id: null, required: true, sort_order: 2 },
  ]).select('id, type')
  if (indErr) throw new Error('induction items: ' + indErr.message)
  const indByType = Object.fromEntries(indItems.map((i) => [i.type, i.id]))
  const { data: sgItems, error: sgErr } = await sb.from('ess_training_items').insert([
    { company_id: cid, module_id: safeguardingId, type: 'video', title: 'Safeguarding video', video_url: 'https://example.test/safeguarding.mp4', required: true, sort_order: 0 },
  ]).select('id, type')
  if (sgErr) throw new Error('safeguarding items: ' + sgErr.message)
  const sgByType = Object.fromEntries(sgItems.map((i) => [i.type, i.id]))
  const { error: asgErr } = await sb.from('ess_training_assignments').insert([
    { company_id: cid, module_id: inductionId, target_type: 'role', target_value: 'employee' },
    { company_id: cid, module_id: safeguardingId, target_type: 'role', target_value: 'employee' },
  ])
  if (asgErr) throw new Error('assignments: ' + asgErr.message)

  // 3f. resolve STEP_DEFS refs to concrete ids
  const refId = (ref) => {
    if (!ref) return null
    const [kind, name] = ref
    if (kind === 'doc') return docByName[name]
    if (kind === 'cert') return certByName[name]
    if (kind === 'mod') return modByName[name]
    return null
  }
  const stepRow = (s, i, extra) => ({
    company_id: cid,
    title: s.title, description: s.description,
    sort_order: i + 1, status: 'pending',
    step_type: s.step_type, ref_kind: s.ref_kind, ref_id: refId(s.ref), auto_complete: s.auto_complete,
    ...extra,
  })

  // 3g. template + typed template steps
  const { data: tmpl } = await sb.from('ess_onboarding_templates')
    .insert({ company_id: cid, name: 'Volunteer Onboarding', description: 'Standard Birch volunteer onboarding', is_default: true })
    .select('id').single()
  await sb.from('ess_onboarding_steps').insert(STEP_DEFS.map((s, i) => stepRow(s, i, { template_id: tmpl.id, employee_id: null })))

  // 3h. ancillary master data
  const { data: reminderCfg } = await sb.from('ess_reminder_configs').insert({ company_id: cid, applies_to: 'certification', offsets: [90,30,7,0,-7], frequency: 'weekly', email_subject: 'Your {{cert_name}} is due to expire', email_body_html: '<p>Please renew your {{cert_name}}.</p>', escalate_to: 'supervisor', is_active: true }).select('id').single()
  const reminderConfigId = reminderCfg?.id
  await sb.from('ess_message_templates').insert([
    { company_id: cid, name: 'Welcome', subject: 'Welcome to Birch', body_html: '<p>Welcome aboard!</p>' },
    { company_id: cid, name: 'Outreach roster', subject: 'This week roster', body_html: '<p>Surfers Paradise (Mon), Southport (Wed).</p>' },
  ])

  // 4. instantiate onboarding for every volunteer from the typed template.
  //    volOutreach/volOpshop/volAuto MUST start not_started (E2E gate specs).
  for (const key of VOL_KEYS) {
    const emp = fixtures.users[key].employeeId
    await sb.from('ess_onboarding_states').insert({ company_id: cid, employee_id: emp, status: 'not_started' })
    await sb.from('ess_onboarding_steps').insert(STEP_DEFS.map((s, i) => stepRow(s, i, { employee_id: emp })))
  }

  // 4b. a few realistic delivered announcements so the inbox demos well
  const adminAu = fixtures.users.admin.appUserId
  const volEmps = ['volOutreach', 'volOpshop', 'volAuto'].map((k) => fixtures.users[k].employeeId)
  const DEMO_MSGS = [
    { subject: 'Welcome to Birch Foundation 💚', body: '<p>Welcome aboard! We are thrilled to have you volunteering with us.</p><p>Start with <strong>My Onboarding</strong> to get set up — sign your Volunteer Agreement, complete your profile, and work through your training.</p><p>If you have any questions, reach out to your coordinator any time.</p>' },
    { subject: "This week's outreach roster", body: '<p>Here is the roster for this week:</p><ul><li><strong>Monday</strong> — Surfers Paradise</li><li><strong>Wednesday</strong> — Southport</li><li><strong>Friday</strong> — Broadbeach</li></ul><p>Please confirm your availability with your coordinator.</p>' },
    { subject: 'Reminder: complete your Safeguarding training', body: '<p>A quick reminder to finish your <strong>Safeguarding &amp; Child-Safe</strong> module this week. It keeps the people we support safe — thank you.</p>' },
  ]
  for (const dm of DEMO_MSGS) {
    const { data: msg } = await sb.from('ess_messages').insert({ company_id: cid, subject: dm.subject, body_html: dm.body, sender_app_user_id: adminAu, status: 'sent', sent_at: new Date().toISOString() }).select('id').single()
    if (msg) await sb.from('ess_message_recipients').insert(volEmps.map((eid) => ({ company_id: cid, message_id: msg.id, employee_id: eid })))
  }

  // ============ 6. DEMO DATASET — authentic, varied compliance data ============
  // Real expiry dates (valid / expiring-soon / expired), review states, training
  // progress + expiry, requirements, recertifications and reminder sends — so the
  // Compliance Register, Reports, Recertification and Expiry Reminders screens
  // are populated and presentable to customers.
  const todayD = new Date()
  const dDays = (n) => { const x = new Date(todayD); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
  const dMonthsAgo = (n) => { const x = new Date(todayD); x.setMonth(x.getMonth() - n); return x.toISOString().slice(0, 10) }
  const addMonthsIso = (dateStr, n) => { const x = new Date(dateStr + 'T00:00:00Z'); x.setMonth(x.getMonth() + n); return x.toISOString() }
  const certStatusFor = (expiry) => {
    if (!expiry) return 'valid'
    const days = Math.round((new Date(expiry + 'T00:00:00Z').getTime() - todayD.getTime()) / 86400000)
    return days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'valid'
  }
  const E = (k) => fixtures.users[k].employeeId

  // Training module expiry (validity in months) — drives auto re-assignment.
  await sb.from('ess_training_modules').update({ validity_months: 12 }).eq('id', safeguardingId)
  await sb.from('ess_training_modules').update({ validity_months: 12 }).eq('id', modByName['WHS & Manual Handling'])
  await sb.from('ess_training_modules').update({ validity_months: 24 }).eq('id', modByName['Food Safety Basics'])

  // Certifications: [key, [[certName, completedMonthsAgo, expiryInDays|null, verification, hasFile]]]
  const CERT_PROFILES = {
    superadmin:  [['National Police Check', 2, 900, 'validated', false], ['Blue Card (Working With Children)', 2, 800, 'validated', false]],
    admin:       [['National Police Check', 2, 950, 'validated', false], ['Blue Card (Working With Children)', 2, 850, 'validated', false]],
    volOutreach: [['National Police Check', 6, 540, 'validated', true], ['Blue Card (Working With Children)', 30, 20, 'validated', false], ['First Aid Certificate (HLTAID011)', 38, -12, 'validated', false]],
    volOpshop:   [['National Police Check', 2, 800, 'validated', false], ['Food Safety (Handling)', 10, 600, 'validated', false]],
    volAuto:     [['National Police Check', 1, 1000, 'validated', false]],
    vol4:        [['National Police Check', 8, 360, 'validated', true], ['Blue Card (Working With Children)', 33, 18, 'validated', false], ['First Aid Certificate (HLTAID011)', 40, -25, 'validated', false]],
    vol5:        [['National Police Check', 0, 1000, 'submitted', true], ['Blue Card (Working With Children)', 5, 700, 'validated', false]],
    vol6:        [['National Police Check', 3, 900, 'validated', true], ['Food Safety (Handling)', 1, 1700, 'changes_requested', false]],
    vol7:        [['National Police Check', 33, 25, 'validated', false], ['NDIS Worker Screening', 6, 1600, 'validated', false]],
    vol8:        [['National Police Check', 37, -6, 'validated', true], ['Blue Card (Working With Children)', 12, 700, 'validated', false]],
    vol9:        [['National Police Check', 4, 600, 'validated', false], ['Manual Handling / WHS Induction', 13, -18, 'validated', false]],
    staff:       [['National Police Check', 4, 700, 'validated', true], ['Blue Card (Working With Children)', 30, 28, 'validated', false], ['First Aid Certificate (HLTAID011)', 6, 540, 'validated', false]],
    staff2:      [['National Police Check', 5, 400, 'validated', false], ['Blue Card (Working With Children)', 8, 500, 'validated', false]],
  }
  const certIdByKeyName = {}
  const fileTargets = []
  for (const [key, certs] of Object.entries(CERT_PROFILES)) {
    for (const [cName, compM, expD, vs, hasFile] of certs) {
      const expiry = expD === null ? null : dDays(expD)
      const { data: row } = await sb.from('ess_certifications').insert({
        company_id: cid, employee_id: E(key), cert_type_id: certByName[cName], title: cName,
        completion_date: dMonthsAgo(compM), expiry_date: expiry, status: certStatusFor(expiry),
        verification_status: vs, verified_by: vs === 'validated' ? adminAu : null,
        verified_at: vs === 'validated' ? new Date().toISOString() : null, created_by: E(key),
      }).select('id').single()
      if (row) {
        certIdByKeyName[`${key}:${cName}`] = row.id
        if (hasFile) fileTargets.push({ id: row.id, certName: cName })
      }
    }
  }
  // Attach a generic evidence PDF to flagged certs (private 'certifications' bucket).
  await ensureBucket('certifications', false)
  for (const ft of fileTargets) {
    const path = `${cid}/${ft.id}/evidence.pdf`
    const pdf = await makePdf(`${ft.certName} — Evidence (Birch Foundation)`)
    await sb.storage.from('certifications').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    await sb.from('ess_certifications').update({ file_url: path, file_name: 'evidence.pdf' }).eq('id', ft.id)
  }

  // Training progress: [key, [[moduleName, status, completedMonthsAgo|null, percent]]]
  const TRAIN_PROFILES = {
    superadmin:  [['Safeguarding & Child-Safe', 'complete', 3, 100]],
    admin:       [['Safeguarding & Child-Safe', 'complete', 2, 100]],
    volOutreach: [['Volunteer Induction', 'in_progress', 1, 60], ['Safeguarding & Child-Safe', 'not_started', null, 0]],
    volOpshop:   [['Volunteer Induction', 'complete', 3, 100], ['Safeguarding & Child-Safe', 'complete', 2, 100]],
    volAuto:     [['Volunteer Induction', 'not_started', null, 0]],
    vol4:        [['Volunteer Induction', 'complete', 5, 100], ['Safeguarding & Child-Safe', 'complete', 13, 100]],
    vol5:        [['Volunteer Induction', 'in_progress', 1, 40]],
    vol6:        [['Volunteer Induction', 'complete', 1, 100], ['Safeguarding & Child-Safe', 'complete', 1, 100]],
    vol7:        [['Volunteer Induction', 'complete', 6, 100], ['Safeguarding & Child-Safe', 'complete', 11, 100]],
    vol8:        [['Volunteer Induction', 'complete', 2, 100], ['Safeguarding & Child-Safe', 'in_progress', 1, 30]],
    vol9:        [['Volunteer Induction', 'complete', 4, 100], ['Safeguarding & Child-Safe', 'complete', 2, 100]],
    staff:       [['Volunteer Induction', 'complete', 8, 100], ['WHS & Manual Handling', 'complete', 13, 100]],
    staff2:      [['Volunteer Induction', 'complete', 3, 100]],
  }
  const modValidity = { [safeguardingId]: 12, [modByName['WHS & Manual Handling']]: 12, [modByName['Food Safety Basics']]: 24 }
  const progressRows = []
  for (const [key, mods] of Object.entries(TRAIN_PROFILES)) {
    for (const [mName, status, compM, pct] of mods) {
      const moduleId = modByName[mName]
      const startedRef = dMonthsAgo(compM ?? 1)
      const completedAt = status === 'complete' ? new Date(dMonthsAgo(compM) + 'T00:00:00Z').toISOString() : null
      const validity = modValidity[moduleId]
      const expiresAt = status === 'complete' && validity ? addMonthsIso(dMonthsAgo(compM), validity) : null
      progressRows.push({
        company_id: cid, employee_id: E(key), module_id: moduleId, status, percent_complete: pct,
        started_at: status === 'not_started' ? null : new Date(startedRef + 'T00:00:00Z').toISOString(),
        completed_at: completedAt, expires_at: expiresAt,
      })
    }
  }
  if (progressRows.length) await sb.from('ess_training_progress').insert(progressRows)

  // Compliance requirements (the admin-defined register).
  await sb.from('ess_compliance_requirements').insert([
    { company_id: cid, kind: 'certification', ref_id: certByName['National Police Check'], target_type: 'tier', target_value: 'all', created_by: adminAu },
    { company_id: cid, kind: 'certification', ref_id: certByName['Blue Card (Working With Children)'], target_type: 'tier', target_value: 'all', created_by: adminAu },
    { company_id: cid, kind: 'training', ref_id: safeguardingId, target_type: 'tier', target_value: 'all', created_by: adminAu },
    { company_id: cid, kind: 'training', ref_id: inductionId, target_type: 'tier', target_value: 'volunteer', created_by: adminAu },
    { company_id: cid, kind: 'certification', ref_id: certByName['First Aid Certificate (HLTAID011)'], target_type: 'tier', target_value: 'volunteer', created_by: adminAu },
    { company_id: cid, kind: 'training', ref_id: modByName['WHS & Manual Handling'], target_type: 'tier', target_value: 'staff', created_by: adminAu },
  ])

  // Recertifications opened from expired certs.
  const recertRows = []
  const addRecert = (key, certName, status, moduleName, triggeredDaysAgo, completedDaysAgo) => {
    const certId = certIdByKeyName[`${key}:${certName}`]
    if (!certId) return
    recertRows.push({
      company_id: cid, employee_id: E(key), certification_id: certId,
      triggered_at: new Date(dDays(-triggeredDaysAgo) + 'T00:00:00Z').toISOString(),
      assigned_module_id: modByName[moduleName], status,
      completed_at: completedDaysAgo != null ? new Date(dDays(-completedDaysAgo) + 'T00:00:00Z').toISOString() : null,
    })
  }
  addRecert('volOutreach', 'First Aid Certificate (HLTAID011)', 'assigned', 'Safeguarding & Child-Safe', 10, null)
  addRecert('vol4', 'First Aid Certificate (HLTAID011)', 'in_progress', 'Volunteer Induction', 22, null)
  addRecert('vol8', 'National Police Check', 'assigned', 'Safeguarding & Child-Safe', 5, null)
  addRecert('vol9', 'Manual Handling / WHS Induction', 'completed', 'WHS & Manual Handling', 16, 2)
  if (recertRows.length) await sb.from('ess_recertifications').insert(recertRows)

  // Reminder sends log (expiry notices already issued).
  if (reminderConfigId) {
    const sendRows = []
    const addSends = (key, certName, offsets) => {
      const certId = certIdByKeyName[`${key}:${certName}`]
      if (!certId) return
      for (const off of offsets) sendRows.push({ company_id: cid, reminder_config_id: reminderConfigId, certification_id: certId, employee_id: E(key), offset_sent: off, sent_at: new Date(dDays(-(Math.abs(off) + 1)) + 'T09:00:00Z').toISOString() })
    }
    addSends('volOutreach', 'Blue Card (Working With Children)', [90, 30])
    addSends('vol4', 'Blue Card (Working With Children)', [90, 30])
    addSends('staff', 'Blue Card (Working With Children)', [90, 30])
    addSends('volOutreach', 'First Aid Certificate (HLTAID011)', [30, 7, 0, -7])
    addSends('vol8', 'National Police Check', [30, 7, 0])
    if (sendRows.length) await sb.from('ess_reminder_sends').insert(sendRows)
  }

  // 5. export the artifact ids the gate spec drives
  fixtures.onboarding = {
    docs: {
      volunteerAgreement: { id: docByName['Volunteer Agreement'], versionId: versionByDoc['Volunteer Agreement'] },
      codeOfConduct: { id: docByName['Code of Conduct'], versionId: versionByDoc['Code of Conduct'] },
      safeguardingPolicy: { id: docByName['Child-Safe & Safeguarding Policy'], versionId: versionByDoc['Child-Safe & Safeguarding Policy'] },
    },
    certTypes: { policeCheck: certByName['National Police Check'], blueCard: certByName['Blue Card (Working With Children)'] },
    modules: {
      induction: { id: inductionId, items: { video: indByType['video'], document: indByType['document'], quiz: indByType['quiz'] } },
      safeguarding: { id: safeguardingId, items: { video: sgByType['video'] } },
    },
  }

  mkdirSync(resolve(process.cwd(), 'tests/fixtures'), { recursive: true })
  writeFileSync(resolve(process.cwd(), 'tests/fixtures/birch-e2e.json'), JSON.stringify(fixtures, null, 2))
  console.log('Wrote tests/fixtures/birch-e2e.json')
  console.log('Seeded birch-e2e:', Object.keys(fixtures.users).join(', '))
}
main().then(() => { console.log('Done.'); process.exit(0) }).catch((e) => { console.error(e); process.exit(1) })
