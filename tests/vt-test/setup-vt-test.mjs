// Create (once) and fill the TEST tenant `vt-test` for the volunteer types test.
//
// 1. The tenant is created the way a real customer is: a super admin calls
//    POST /api/platform/tenants on the target site (default: production).
// 2. The supporting content that onboarding steps link to (documents,
//    certificate types, training courses) is added with the service key.
//    These are older features. The volunteer types setup itself is done by the
//    spec, through the real screens and API.
//
// SAFETY: this script only ever writes to the tenant with slug `vt-test`.
// Run: node tests/vt-test/setup-vt-test.mjs        (VT_BASE overrides the site)
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
const ge = (k) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : '' }
const sb = createClient(ge('NEXT_PUBLIC_SUPABASE_URL'), ge('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const BASE = process.env.VT_BASE || 'https://ess.mosping.com'
const SLUG = 'vt-test' // fixed on purpose: never point this script at another tenant
const NAME = 'Volunteer Types Test'
const ADMIN = { email: 'admin@vt-test.test', password: 'VtTest2026!', name: 'Alex Morgan' }
const SUPER = { email: 'superadmin@mosping.test', password: 'E2ePass123!' }
const MODULES = ['profiles', 'documents', 'documents_esign', 'communications', 'training', 'quizzes', 'training_tracking', 'reporting', 'compliance', 'expiry_reminders', 'recertification']

const CERT_TYPES = [
  // name, validity months, requires file
  ['National Police Check', 36, true],
  ['Working With Children Check', 60, true],
  ['First Aid Certificate', 36, true],
  ['Food Safety Certificate', 60, true],
]
// title, requires acknowledgment, e-sign (signature field)
const DOCS = [
  ['Volunteer Agreement', true, true],
  ['Code of Conduct', true, false],
  ['Cash Handling Policy', true, false],
  ['Event Safety Brief', true, false],
  ['Privacy and Confidentiality Policy', true, false],
]
const COURSES = ['Volunteer Induction', 'Manual Handling', 'Customer Service Basics']

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ usr: email, pwd: password }),
  })
  const d = await r.json().catch(() => ({}))
  if (!d.access_token) throw new Error(`login ${email}: ${d.message || r.status}`)
  return d.access_token
}

async function makePdf(text, withSignature) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText(text, { x: 60, y: 760, size: 16, font })
  page.drawText('Test document for the volunteer types test tenant.', { x: 60, y: 730, size: 11, font })
  if (withSignature) page.drawText('Signature: ____________________', { x: 60, y: 120, size: 12, font })
  return Buffer.from(await pdf.save())
}

async function main() {
  // 1. Tenant, through the real platform API.
  let { data: company } = await sb.from('ess_companies').select('id, settings').eq('slug', SLUG).maybeSingle()
  if (!company) {
    const token = await login(SUPER.email, SUPER.password)
    const r = await fetch(`${BASE}/api/platform/tenants`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: NAME, company_slug: SLUG, admin_email: ADMIN.email, admin_password: ADMIN.password,
        admin_name: ADMIN.name, plan_slug: 'enterprise', modules_enabled: MODULES,
      }),
    })
    const d = await r.json()
    if (r.status !== 200) throw new Error(`create tenant: ${r.status} ${JSON.stringify(d)}`)
    console.log('tenant created through POST /api/platform/tenants:', d.tenant.id)
    ;({ data: company } = await sb.from('ess_companies').select('id, settings').eq('slug', SLUG).single())
  } else {
    console.log('tenant exists:', company.id)
  }
  const cid = company.id
  await sb.from('ess_companies').update({ settings: { ...(company.settings || {}), modules_enabled: MODULES, brand_name: NAME } }).eq('id', cid)

  const { data: adminEmp } = await sb.from('ess_employees').select('id').eq('company_id', cid).eq('email', ADMIN.email).single()

  // 2. Certificate types.
  const { data: haveCerts } = await sb.from('ess_cert_types').select('name').eq('company_id', cid)
  const certNames = new Set((haveCerts ?? []).map((c) => c.name))
  const newCerts = CERT_TYPES.filter(([n]) => !certNames.has(n))
  if (newCerts.length) {
    const { error } = await sb.from('ess_cert_types').insert(newCerts.map(([name, vm, rf]) => ({ company_id: cid, name, validity_months: vm, requires_file: rf, required: false, reminder_offsets: [30, 7, 0] })))
    if (error) throw new Error('cert types: ' + error.message)
  }

  // 3. Documents, each with a v1 PDF; e-sign documents get a signature field.
  const { data: haveDocs } = await sb.from('ess_documents').select('title').eq('company_id', cid)
  const docTitles = new Set((haveDocs ?? []).map((d) => d.title))
  for (const [title, ack, esign] of DOCS.filter(([t]) => !docTitles.has(t))) {
    const { data: doc, error } = await sb.from('ess_documents')
      .insert({ company_id: cid, title, description: `${title} (test)`, is_published: true, requires_acknowledgment: ack, published_at: new Date().toISOString(), created_by: adminEmp.id })
      .select('id').single()
    if (error) throw new Error(`document ${title}: ${error.message}`)
    const pdf = await makePdf(title, esign)
    const path = `${cid}/${doc.id}/v1.pdf`
    const { error: upErr } = await sb.storage.from('ess-documents').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw new Error(`upload ${title}: ${upErr.message}`)
    const { data: ver, error: vErr } = await sb.from('ess_document_versions')
      .insert({ document_id: doc.id, version_number: 1, file_url: path, file_name: `${title}.pdf`, file_size: pdf.length, uploaded_by: adminEmp.id })
      .select('id').single()
    if (vErr) throw new Error(`version ${title}: ${vErr.message}`)
    if (esign) {
      const { error: fErr } = await sb.from('ess_document_fields').insert({
        company_id: cid, document_id: doc.id, version_id: ver.id, field_key: 'signature', label: 'Signature', type: 'signature',
        required: true, page: 1, x_ratio: 0.2, y_ratio: 0.85, width_ratio: 0.3, height_ratio: 0.04, sort_order: 0,
      })
      if (fErr) throw new Error(`field ${title}: ${fErr.message}`)
    }
  }

  // 4. Training courses (published), one short video each.
  const { data: haveMods } = await sb.from('ess_training_modules').select('title').eq('company_id', cid)
  const modTitles = new Set((haveMods ?? []).map((m) => m.title))
  for (const title of COURSES.filter((t) => !modTitles.has(t))) {
    const { data: mod, error } = await sb.from('ess_training_modules').insert({ company_id: cid, title, description: `${title} (test course)`, status: 'published', created_by: null }).select('id').single()
    if (error) throw new Error(`course ${title}: ${error.message}`)
    const { error: iErr } = await sb.from('ess_training_items').insert({ company_id: cid, module_id: mod.id, type: 'video', title: `${title} video`, video_url: 'https://example.test/video.mp4', required: true, sort_order: 0 })
    if (iErr) throw new Error(`course item ${title}: ${iErr.message}`)
  }

  mkdirSync(resolve(process.cwd(), 'test-results'), { recursive: true })
  const fx = { base: BASE, slug: SLUG, companyId: cid, admin: ADMIN }
  writeFileSync(resolve(process.cwd(), 'test-results/vt-test.json'), JSON.stringify(fx, null, 2))
  console.log('ready:', JSON.stringify(fx))
}

main().catch((e) => { console.error(e); process.exit(1) })
