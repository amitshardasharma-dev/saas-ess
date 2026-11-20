/**
 * Full test of "custom onboarding for each volunteer" in the dedicated TEST
 * tenant `vt-test` (made by tests/vt-test/setup-vt-test.mjs).
 *
 * Each test maps to a requirement of the Birch ticket. The run starts from an
 * empty tenant (people, types and flows are removed first) and ends in a demo
 * state that a person can log in to and look at.
 *
 * Run:
 *   node tests/vt-test/setup-vt-test.mjs
 *   E2E_BASE=https://ess.mosping.com npx playwright test --project=vt
 * Screenshots go to test-results/vt-shots/.
 */
import { test, expect, request, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
const ge = (k: string) => { const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return m ? m[1].trim() : '' }
const sb = createClient(ge('NEXT_PUBLIC_SUPABASE_URL'), ge('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const FX = JSON.parse(readFileSync(resolve(process.cwd(), 'test-results/vt-test.json'), 'utf8')) as {
  base: string; slug: string; companyId: string; admin: { email: string; password: string; name: string }
}
if (FX.slug !== 'vt-test') throw new Error('This spec only runs in the vt-test tenant')
const BASE = process.env.E2E_BASE || FX.base
const CID = FX.companyId
const PW = FX.admin.password
const SHOTS = resolve(process.cwd(), 'test-results/vt-shots')
mkdirSync(SHOTS, { recursive: true })

// A birch-foundation volunteer type and employee, for isolation probes (READ ONLY: never written).
const FOREIGN_TYPE_ID = 'c246901d-0d3b-4fa1-af22-49ab4c435173' // "Op shop" @ birch-foundation
const FOREIGN_EMPLOYEE_ID = '48457239-a14d-4da9-aed6-4f8259bee7f9' // @ birch-foundation

const PEOPLE = {
  casey: { email: 'casey.nguyen@vt-test.test', name: 'Casey Nguyen', role: 'hr' },
  mia: { email: 'mia.brown@vt-test.test', name: 'Mia Brown', role: 'employee' },
  sam: { email: 'sam.taylor@vt-test.test', name: 'Sam Taylor', role: 'employee' },
  priya: { email: 'priya.shah@vt-test.test', name: 'Priya Shah', role: 'employee' },
  jordan: { email: 'jordan.lee@vt-test.test', name: 'Jordan Lee', role: 'employee' },
  riley: { email: 'riley.chen@vt-test.test', name: 'Riley Chen', role: 'employee' },
  noah: { email: 'noah.wilson@vt-test.test', name: 'Noah Wilson', role: 'employee' },
} as const
type Key = keyof typeof PEOPLE

type Step = { id: string; title: string; status: string; is_required: boolean; origin: string; step_type: string; ref_id: string | null; waived_by: string | null; waive_reason: string | null }
type Onb = { state: { status: string; approved_at: string | null } | null; steps: Step[]; types: { id: string; name: string }[] }
type Res = { status: number; body: Record<string, unknown> | null }

/* ------------------------------- helpers -------------------------------- */

const tokens = new Map<string, string>()
async function tokenFor(email: string): Promise<string> {
  if (tokens.has(email)) return tokens.get(email)!
  const ctx = await request.newContext({ baseURL: BASE })
  const r = await ctx.post('/api/auth/login', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, form: { usr: email, pwd: PW } })
  const d = await r.json()
  await ctx.dispose()
  if (!d.access_token) throw new Error(`login ${email}: ${d.message || r.status()}`)
  tokens.set(email, d.access_token)
  return d.access_token
}

async function api(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const ctx = await request.newContext({ baseURL: BASE })
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const r = await ctx.fetch(path, { method, headers, data: body !== undefined ? JSON.stringify(body) : undefined })
  let data: Record<string, unknown> | null = null
  try { data = (await r.json()) as Record<string, unknown> } catch { /* no body */ }
  const status = r.status()
  await ctx.dispose()
  return { status, body: data }
}

let admin = ''
let casey = ''
const emp: Partial<Record<Key, string>> = {}
const typeId: Record<string, string> = {}
let opt: { documents: { id: string; title: string }[]; certTypes: { id: string; name: string }[]; modules: { id: string; title: string }[] }
const doc = (t: string) => opt.documents.find((d) => d.title === t)!.id
const cert = (n: string) => opt.certTypes.find((c) => c.name === n)!.id
const course = (t: string) => opt.modules.find((m) => m.title === t)!.id

const onb = async (k: Key, tok = admin) => {
  const r = await api(tok, 'GET', `/api/onboarding?employee_id=${emp[k]}`)
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as unknown as Onb
}
const titles = (o: Onb) => o.steps.map((s) => s.title)
const step = (o: Onb, t: string) => o.steps.find((s) => s.title === t)
const statusOf = async (k: Key) => (await onb(k)).state!.status

async function addPerson(k: Key, types: string[] = []): Promise<string> {
  const p = PEOPLE[k]
  const r = await api(admin, 'POST', '/api/people', { full_name: p.name, email: p.email, role: p.role, password: PW, department: 'Volunteers', volunteer_type_ids: types.map((t) => typeId[t]) })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  emp[k] = (r.body!.person as { id: string }).id
  return emp[k]!
}
async function setTypes(k: Key, names: string[]) {
  const r = await api(admin, 'PUT', `/api/people/${emp[k]}/volunteer-types`, { type_ids: names.map((n) => typeId[n]) })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as { sync: { added: number; removed: number } }
}
async function saveFlow(target: { audience?: string; type_id?: string }, steps: unknown[]) {
  const r = await api(admin, 'PUT', '/api/onboarding/templates', { ...target, steps })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as { sync?: Record<string, number> }
}
async function markDone(stepId: string, tok = casey) {
  const r = await api(tok, 'PATCH', `/api/onboarding/steps/${stepId}`, { status: 'done' })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
}
async function finishMandatory(k: Key) {
  for (const s of (await onb(k)).steps.filter((x) => x.is_required && x.status === 'pending')) await markDone(s.id)
}

const manual = (title: string, is_required = true) => ({ title, description: null, step_type: 'manual', ref_id: null, auto_complete: false, is_required })
const linked = (title: string, step_type: string, ref_id: string, is_required = true) => ({ title, description: null, step_type, ref_id, auto_complete: true, is_required })

// Flows. The base flow ("All volunteers") applies to every volunteer.
const BASE_FLOW = () => [
  { title: 'Complete your profile', description: null, step_type: 'profile_field', ref_id: null, auto_complete: false, is_required: true },
  linked('Sign the Volunteer Agreement', 'doc_sign', doc('Volunteer Agreement')),
  linked('Read the Code of Conduct', 'doc_ack', doc('Code of Conduct')),
  linked('National Police Check', 'certification', cert('National Police Check')),
  linked('Volunteer Induction', 'training', course('Volunteer Induction')),
  manual('Meet your coordinator', false),
]
const OP_SHOP = (cashTitle = 'Read the Cash Handling Policy', extra: ReturnType<typeof manual>[] = [], foodRequired = false) => [
  linked(cashTitle, 'doc_ack', doc('Cash Handling Policy')),
  linked('Manual Handling training', 'training', course('Manual Handling')),
  manual('First shift with a buddy'),
  linked('Food Safety Certificate', 'certification', cert('Food Safety Certificate'), foodRequired),
  ...extra,
]
const EVENTS = (briefing = 'Event day briefing', extra: ReturnType<typeof manual>[] = []) => [
  linked('Read the Event Safety Brief', 'doc_ack', doc('Event Safety Brief')),
  // Optional here, mandatory in Op shop: a person with both types must do it.
  linked('Manual Handling training', 'training', course('Manual Handling'), false),
  manual(briefing),
  ...extra,
]
const OUTREACH = () => [
  linked('Working With Children Check', 'certification', cert('Working With Children Check')),
  linked('First Aid Certificate', 'certification', cert('First Aid Certificate')),
  // Also in the base flow: shows one time.
  linked('National Police Check', 'certification', cert('National Police Check')),
  manual('Outreach safety training'),
]
const ADMINISTRATION = () => [
  linked('Read the Privacy and Confidentiality Policy', 'doc_ack', doc('Privacy and Confidentiality Policy')),
  manual('IT and email access set up'),
  linked('Customer Service Basics', 'training', course('Customer Service Basics'), false),
]

async function shot(page: Page, name: string) {
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}
async function uiLogin(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const user = page.locator('#username')
  const pwd = page.locator('#password')
  await user.waitFor({ state: 'visible' })
  await user.fill(email)
  await pwd.fill(PW)
  await expect(user).toHaveValue(email)
  await expect(pwd).toHaveValue(PW)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
  await page.waitForTimeout(2500)
}

/** Remove everything a previous run made. Only ever touches the vt-test tenant. */
async function resetTenant() {
  const { data: co } = await sb.from('ess_companies').select('id, slug').eq('id', CID).single()
  if (co?.slug !== 'vt-test') throw new Error(`refusing to reset ${co?.slug}`)
  const { data: emps } = await sb.from('ess_employees').select('id, email, app_user_id').eq('company_id', CID)
  const all = emps ?? []
  const ids = all.map((e) => e.id as string)
  await sb.from('ess_employee_volunteer_types').delete().eq('company_id', CID)
  await sb.from('ess_onboarding_steps').delete().eq('company_id', CID)
  await sb.from('ess_onboarding_states').delete().eq('company_id', CID)
  await sb.from('ess_onboarding_templates').delete().eq('company_id', CID)
  await sb.from('ess_volunteer_types').delete().eq('company_id', CID)
  await sb.from('ess_certifications').delete().eq('company_id', CID)
  if (ids.length) await sb.from('ess_document_acknowledgments').delete().in('employee_id', ids)
  for (const e of all.filter((x) => x.email !== FX.admin.email)) {
    const { data: au } = await sb.from('ess_app_users').select('id, auth_user_id').eq('id', e.app_user_id).maybeSingle()
    const { error } = await sb.from('ess_employees').delete().eq('id', e.id)
    if (error) throw new Error(`reset employee ${e.email}: ${error.message}`)
    if (au) {
      await sb.from('ess_app_users').delete().eq('id', au.id)
      await sb.auth.admin.deleteUser(au.auth_user_id as string)
    }
  }
}

/* -------------------------------- tests --------------------------------- */

test.beforeAll(async () => {
  await resetTenant()
  admin = await tokenFor(FX.admin.email)
})

test('T01 tenant: made by the platform API, the admin signs in, the modules are on', async () => {
  const { data: co } = await sb.from('ess_companies').select('slug, status, settings').eq('id', CID).single()
  expect(co!.status).toBe('active')
  expect((co!.settings as { modules_enabled: string[] }).modules_enabled).toEqual(expect.arrayContaining(['profiles', 'documents', 'training', 'compliance']))
  const { data: audit } = await sb.from('ess_audit_log').select('action').eq('company_id', CID).eq('action', 'tenant.created')
  expect(audit!.length, 'tenant.created audit row').toBeGreaterThan(0)
  const r = await api(admin, 'GET', '/api/volunteer-types')
  expect(r.status).toBe(200)
  expect(r.body!.types).toEqual([])
  const t = await api(admin, 'GET', '/api/onboarding/templates')
  opt = t.body!.options as typeof opt
  expect(opt.documents).toHaveLength(5)
  expect(opt.certTypes).toHaveLength(4)
  expect(opt.modules).toHaveLength(3)
})

test('T02 a new tenant with no flows still gives a new volunteer a starter checklist', async () => {
  await addPerson('casey')
  casey = await tokenFor(PEOPLE.casey.email)
  await addPerson('mia')
  const o = await onb('mia')
  expect(o.steps.length, 'starter (default) steps').toBeGreaterThan(0)
  expect(o.steps.every((s) => s.step_type === 'manual')).toBe(true)
  expect(o.state!.status).toBe('not_started')
})

test('T03 admin sets the steps for all volunteers; existing people get them', async () => {
  await saveFlow({ audience: 'volunteer' }, BASE_FLOW())
  const o = await onb('mia')
  expect(titles(o).sort(), 'starter steps replaced by the new base flow').toEqual(BASE_FLOW().map((s) => s.title).sort())
  expect(step(o, 'Meet your coordinator')!.is_required).toBe(false)
})

test('T04 UI: admin adds the "Op shop" type and builds its flow on Onboarding Flows', async ({ page }) => {
  await uiLogin(page, FX.admin.email)
  await page.goto(`${BASE}/dashboard/onboarding/manage`)
  await expect(page.getByTestId('flow-step')).toHaveCount(6)
  await shot(page, '01-flows-all-volunteers')

  await page.getByRole('button', { name: /Add volunteer type/ }).click()
  await page.getByLabel('New volunteer type name').fill('Op shop')
  await shot(page, '02-add-volunteer-type')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('tab', { name: /Op shop/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('No steps yet')).toBeVisible()

  const want = OP_SHOP()
  const typeLabel: Record<string, string> = { doc_ack: 'Acknowledge a document', training: 'Complete a training', manual: 'Manual — staff marks done', certification: 'Upload a certificate' }
  const linkLabel = ['Cash Handling Policy', 'Manual Handling', '', 'Food Safety Certificate']
  for (let i = 0; i < want.length; i++) {
    const s = want[i] as { title: string; step_type: string; is_required: boolean }
    await page.getByRole('button', { name: 'Add step' }).click()
    const card = page.getByTestId('flow-step').nth(i)
    await card.getByLabel(`Step ${i + 1} title`).fill(s.title)
    await card.getByLabel(`Step ${i + 1} type`).selectOption({ label: typeLabel[s.step_type] })
    if (linkLabel[i]) {
      await card.getByLabel(`Step ${i + 1} linked item`).selectOption({ label: linkLabel[i] })
      await card.getByLabel('Auto-complete when the volunteer does this').check()
    }
    if (!s.is_required) await card.getByLabel('Mandatory (must be done before approval)').uncheck()
  }
  await shot(page, '03-flow-op-shop-before-save')
  await page.getByRole('button', { name: /Save Op shop flow/ }).click()
  await expect(page.getByText(/Op shop flow saved/)).toBeVisible()
  await shot(page, '04-flow-op-shop-saved')

  const types = (await api(admin, 'GET', '/api/onboarding/templates')).body!.types as Array<{ id: string; name: string; steps: Array<{ title: string; step_type: string; ref_id: string | null; is_required: boolean; auto_complete: boolean }> }>
  const op = types.find((t) => t.name === 'Op shop')!
  typeId['Op shop'] = op.id
  expect(op.steps.map((s) => [s.title, s.step_type, s.is_required, s.auto_complete])).toEqual([
    ['Read the Cash Handling Policy', 'doc_ack', true, true],
    ['Manual Handling training', 'training', true, true],
    ['First shift with a buddy', 'manual', true, false],
    ['Food Safety Certificate', 'certification', false, true],
  ])
  expect(op.steps[0].ref_id).toBe(doc('Cash Handling Policy'))
})

test('T05 admin adds three more types; names are unique; only an admin can add a type', async () => {
  for (const name of ['Events', 'Community outreach', 'Administration']) {
    const r = await api(admin, 'POST', '/api/volunteer-types', { name })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    typeId[name] = (r.body!.type as { id: string }).id
  }
  await saveFlow({ type_id: typeId.Events }, EVENTS())
  await saveFlow({ type_id: typeId['Community outreach'] }, OUTREACH())
  await saveFlow({ type_id: typeId.Administration }, ADMINISTRATION())

  expect((await api(admin, 'POST', '/api/volunteer-types', { name: 'op SHOP' })).status, 'duplicate name, case ignored').toBe(409)
  expect((await api(admin, 'POST', '/api/volunteer-types', { name: '   ' })).status, 'empty name').toBe(400)
  expect((await api(admin, 'POST', '/api/volunteer-types', { name: 'x'.repeat(81) })).status, 'name over 80 characters').toBe(400)
  expect((await api(casey, 'POST', '/api/volunteer-types', { name: 'Kitchen' })).status, 'coordinator (HR) cannot add types').toBe(403)
  const list = (await api(casey, 'GET', '/api/volunteer-types')).body!.types as Array<{ name: string }>
  expect(list.map((t) => t.name).sort()).toEqual(['Administration', 'Community outreach', 'Events', 'Op shop'])
})

test('T06 a new volunteer with one type gets the base steps plus the type steps', async () => {
  await addPerson('sam', ['Op shop'])
  const o = await onb('sam')
  expect(o.types.map((t) => t.name)).toEqual(['Op shop'])
  expect(titles(o).sort()).toEqual([...BASE_FLOW(), ...OP_SHOP()].map((s) => s.title).sort())
  expect(o.steps).toHaveLength(10)
})

test('T07 two types: a step in both flows shows one time and is mandatory if one flow says so', async () => {
  await addPerson('priya', ['Op shop', 'Events'])
  const o = await onb('priya')
  expect(titles(o).filter((t) => t === 'Manual Handling training')).toHaveLength(1)
  expect(step(o, 'Manual Handling training')!.is_required).toBe(true)
  expect(o.steps, '6 base + 4 Op shop + 2 more from Events').toHaveLength(12)
})

test('T08 a type step that is also a base step shows one time', async () => {
  await addPerson('jordan', ['Community outreach'])
  const o = await onb('jordan')
  expect(titles(o).filter((t) => t === 'National Police Check')).toHaveLength(1)
  expect(o.steps, '6 base + 3 more from Community outreach').toHaveLength(9)
})

test('T09 UI: admin adds a person with a type on the People page', async ({ page }) => {
  await uiLogin(page, FX.admin.email)
  await page.goto(`${BASE}/dashboard/people`)
  await page.getByRole('button', { name: /Add person/ }).click()
  await page.locator('#np-name').fill(PEOPLE.riley.name)
  await page.locator('#np-email').fill(PEOPLE.riley.email)
  await page.locator('#np-role').selectOption('employee')
  await page.locator('label', { hasText: 'Administration' }).click()
  await shot(page, '05-add-person-with-type')
  await page.getByRole('button', { name: 'Create person' }).click()
  await expect(page.getByText(`Created “${PEOPLE.riley.name}”`)).toBeVisible({ timeout: 30_000 })

  const { data: e } = await sb.from('ess_employees').select('id, app_user_id').eq('company_id', CID).eq('email', PEOPLE.riley.email).single()
  emp.riley = e!.id as string
  // A known password so the report can give a login (the screen shows a temporary one).
  const { data: au } = await sb.from('ess_app_users').select('auth_user_id').eq('id', e!.app_user_id).single()
  await sb.auth.admin.updateUserById(au!.auth_user_id as string, { password: PW })

  const o = await onb('riley')
  expect(o.types.map((t) => t.name)).toEqual(['Administration'])
  expect(o.steps, '6 base + 3 Administration').toHaveLength(9)
})

test('T10 linked steps complete by themselves when the volunteer does the task', async () => {
  const samTok = await tokenFor(PEOPLE.sam.email)
  const ack = await api(samTok, 'POST', `/api/documents/${doc('Cash Handling Policy')}/acknowledge`)
  expect(ack.status, JSON.stringify(ack.body)).toBe(200)
  expect(step(await onb('sam'), 'Read the Cash Handling Policy')!.status, 'document acknowledged -> step done').toBe('done')

  const c = await api(admin, 'POST', '/api/certifications', { employee_id: emp.sam, cert_type_id: cert('National Police Check'), title: 'National Police Check', completion_date: '2026-11-01' })
  expect(c.status, JSON.stringify(c.body)).toBe(201)
  const o = await onb('sam')
  expect(step(o, 'National Police Check')!.status, 'certificate recorded -> step done').toBe('done')
  expect(o.state!.status).toBe('in_progress')
})

test('T11 a step the person already did comes in as done when a type is added', async () => {
  const miaTok = await tokenFor(PEOPLE.mia.email)
  expect((await api(miaTok, 'POST', `/api/documents/${doc('Event Safety Brief')}/acknowledge`)).status).toBe(200)
  const res = await setTypes('mia', ['Events'])
  expect(res.sync.added).toBe(3)
  const o = await onb('mia')
  expect(step(o, 'Read the Event Safety Brief')!.status).toBe('done')
  expect(step(o, 'Event day briefing')!.status).toBe('pending')
})

test('T12 type change: done steps stay, open old-type steps go, new-type steps come', async () => {
  let o = await onb('jordan')
  await markDone(step(o, 'Outreach safety training')!.id)

  const toAdmin = await setTypes('jordan', ['Administration'])
  expect(toAdmin.sync.removed, 'Working With Children Check + First Aid (open, outreach only)').toBe(2)
  expect(toAdmin.sync.added, 'the 3 Administration steps').toBe(3)
  o = await onb('jordan')
  expect(step(o, 'Outreach safety training')!.status, 'done step stays').toBe('done')
  expect(step(o, 'Working With Children Check')).toBeUndefined()
  expect(step(o, 'National Police Check'), 'still in the base flow').toBeTruthy()
  expect(step(o, 'IT and email access set up')).toBeTruthy()

  const back = await setTypes('jordan', ['Community outreach'])
  expect(back.sync.added).toBe(2)
  expect(back.sync.removed).toBe(3)
  o = await onb('jordan')
  expect(o.steps).toHaveLength(9)
  expect(step(o, 'Outreach safety training')!.status).toBe('done')
})

test('T13 a step for one person only: add, no duplicates, admin only, survives syncs, can be removed', async () => {
  const add = await api(admin, 'POST', '/api/onboarding/steps', { employee_id: emp.jordan, title: 'Reference check with a previous employer', step_type: 'manual', is_required: true })
  expect(add.status, JSON.stringify(add.body)).toBe(201)
  expect((await api(admin, 'POST', '/api/onboarding/steps', { employee_id: emp.jordan, title: 'reference check with a previous EMPLOYER', step_type: 'manual' })).status, 'duplicate').toBe(409)
  expect((await api(admin, 'POST', '/api/onboarding/steps', { employee_id: emp.jordan, title: 'WWCC again', step_type: 'certification', ref_id: cert('Working With Children Check') })).status, 'same linked item as a flow step').toBe(409)
  expect((await api(casey, 'POST', '/api/onboarding/steps', { employee_id: emp.jordan, title: 'x', step_type: 'manual' })).status, 'coordinator cannot').toBe(403)

  await setTypes('jordan', ['Administration'])
  await saveFlow({ type_id: typeId['Community outreach'] }, OUTREACH())
  await setTypes('jordan', ['Community outreach'])
  let o = await onb('jordan')
  const ref = step(o, 'Reference check with a previous employer')!
  expect(ref.origin, 'still there after two type changes and a flow save').toBe('personal')

  const tmp = await api(admin, 'POST', '/api/onboarding/steps', { employee_id: emp.jordan, title: 'Temporary step', step_type: 'manual' })
  const tmpId = (tmp.body!.step as { id: string }).id
  expect((await api(admin, 'DELETE', `/api/onboarding/steps/${tmpId}`)).status, 'open personal step can be removed').toBe(200)
  const flowStep = o.steps.find((s) => s.origin === 'flow' && s.status === 'pending')!
  expect((await api(admin, 'DELETE', `/api/onboarding/steps/${flowStep.id}`)).status, 'a flow step cannot be removed (use Not needed)').toBe(400)

  // A personal linked step that the person already did is done at once.
  const priyaTok = await tokenFor(PEOPLE.priya.email)
  expect((await api(priyaTok, 'POST', `/api/documents/${doc('Privacy and Confidentiality Policy')}/acknowledge`)).status).toBe(200)
  const pp = await api(admin, 'POST', '/api/onboarding/steps', { employee_id: emp.priya, title: 'Read the Privacy and Confidentiality Policy', step_type: 'doc_ack', ref_id: doc('Privacy and Confidentiality Policy') })
  expect(pp.status).toBe(201)
  o = await onb('priya')
  expect(step(o, 'Read the Privacy and Confidentiality Policy')!.status).toBe('done')
})

test('T14 "not needed": admin only, the reason is recorded, a sync keeps it, restore works', async () => {
  let o = await onb('priya')
  const mh = step(o, 'Manual Handling training')!
  const priyaTok = await tokenFor(PEOPLE.priya.email)
  expect((await api(priyaTok, 'PATCH', `/api/onboarding/steps/${mh.id}`, { status: 'done' })).status, 'a volunteer cannot tick own steps').toBe(403)
  expect((await api(casey, 'PATCH', `/api/onboarding/steps/${mh.id}`, { status: 'skipped' })).status, 'coordinator cannot mark not needed').toBe(403)

  const reason = 'Has a current Manual Handling certificate from another charity'
  expect((await api(admin, 'PATCH', `/api/onboarding/steps/${mh.id}`, { status: 'skipped', reason })).status).toBe(200)
  o = await onb('priya')
  const { data: adminAu } = await sb.from('ess_app_users').select('id').eq('company_id', CID).eq('role', 'admin').limit(1).single()
  expect(step(o, 'Manual Handling training')).toMatchObject({ status: 'skipped', waive_reason: reason, waived_by: adminAu!.id })

  await saveFlow({ type_id: typeId.Events }, EVENTS())
  await saveFlow({ type_id: typeId['Op shop'] }, OP_SHOP())
  expect(step(await onb('priya'), 'Manual Handling training')!.status, 'flow saves do not bring it back').toBe('skipped')

  expect((await api(admin, 'PATCH', `/api/onboarding/steps/${mh.id}`, { status: 'pending' })).status).toBe(200)
  expect(step(await onb('priya'), 'Manual Handling training')!.status, 'restored').toBe('pending')
  expect((await api(admin, 'PATCH', `/api/onboarding/steps/${mh.id}`, { status: 'skipped', reason })).status).toBe(200)
})

test('T15 approval: only when every mandatory step is resolved; optional steps do not block', async () => {
  expect((await api(admin, 'POST', '/api/onboarding/approval', { employee_id: emp.priya, action: 'approve' })).status, 'mandatory steps open').toBe(409)

  await finishMandatory('priya')
  let o = await onb('priya')
  expect(step(o, 'Food Safety Certificate')!.status, 'optional step still open').toBe('pending')
  expect(o.state!.status, 'ready for approval').toBe('completed')
  expect((await api(casey, 'POST', '/api/onboarding/approval', { employee_id: emp.priya, action: 'approve' })).status, 'coordinator cannot approve').toBe(403)

  await finishMandatory('sam')
  expect(await statusOf('sam')).toBe('completed')
  const ok = await api(admin, 'POST', '/api/onboarding/approval', { employee_id: emp.sam, action: 'approve' })
  expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  expect((await api(admin, 'POST', '/api/onboarding/approval', { employee_id: emp.sam, action: 'approve' })).status, 'already approved').toBe(409)
  const samView = (await api(await tokenFor(PEOPLE.sam.email), 'GET', '/api/onboarding')).body as unknown as Onb
  expect(samView.state!.status, 'the volunteer sees Approved').toBe('approved')
  const { data: audit } = await sb.from('ess_audit_log').select('action').eq('company_id', CID).eq('action', 'onboarding.approved').eq('target_id', emp.sam!)
  expect(audit!.length, 'one audit row for the approval').toBe(1)
  o = await onb('sam')
  expect(o.state!.approved_at).toBeTruthy()
})

test('T16 a new mandatory step after approval: approval stays, status returns to Approved when done', async () => {
  await saveFlow({ type_id: typeId['Op shop'] }, OP_SHOP(undefined, [manual('Read the new volunteer handbook')]))
  const o = await onb('sam')
  expect(o.state!.status, 'new mandatory step open').toBe('in_progress')
  expect(o.state!.approved_at, 'approval kept').toBeTruthy()
  expect(await statusOf('priya')).toBe('in_progress')

  await markDone(step(o, 'Read the new volunteer handbook')!.id)
  expect(await statusOf('sam'), 'approved again, no new approval needed').toBe('approved')
  await markDone(step(await onb('priya'), 'Read the new volunteer handbook')!.id)
  expect(await statusOf('priya')).toBe('completed')

  const rev = await api(admin, 'POST', '/api/onboarding/approval', { employee_id: emp.sam, action: 'revoke' })
  expect(rev.status).toBe(200)
  expect(await statusOf('sam'), 'revoked -> ready for approval').toBe('completed')
  expect((await api(admin, 'POST', '/api/onboarding/approval', { employee_id: emp.sam, action: 'approve' })).status).toBe(200)
})

test('T17 editing a flow updates people: wording, mandatory flag, added and removed steps', async () => {
  // Linked step renamed: same step, new words, status kept.
  await saveFlow({ type_id: typeId['Op shop'] }, OP_SHOP('Read and accept the Cash Handling Policy', [manual('Read the new volunteer handbook')]))
  let o = await onb('sam')
  expect(step(o, 'Read and accept the Cash Handling Policy')!.status).toBe('done')
  expect(step(o, 'Read the Cash Handling Policy')).toBeUndefined()

  // Optional -> mandatory -> optional.
  await saveFlow({ type_id: typeId['Op shop'] }, OP_SHOP('Read and accept the Cash Handling Policy', [manual('Read the new volunteer handbook')], true))
  expect(step(await onb('priya'), 'Food Safety Certificate')!.is_required).toBe(true)
  expect(await statusOf('priya'), 'now a mandatory step is open').toBe('in_progress')
  await saveFlow({ type_id: typeId['Op shop'] }, OP_SHOP('Read and accept the Cash Handling Policy', [manual('Read the new volunteer handbook')], false))
  expect(await statusOf('priya')).toBe('completed')

  // A step added and then removed from a flow: open copies go.
  await saveFlow({ type_id: typeId.Events }, EVENTS(undefined, [manual('Temporary events step')]))
  expect(step(await onb('mia'), 'Temporary events step')).toBeTruthy()
  await saveFlow({ type_id: typeId.Events }, EVENTS())
  expect(step(await onb('mia'), 'Temporary events step')).toBeUndefined()

  // A MANUAL step renamed is a new step: a done copy stays, a new open copy comes.
  o = await onb('mia')
  await markDone(step(o, 'Event day briefing')!.id)
  await saveFlow({ type_id: typeId.Events }, EVENTS('Event day briefing (30 minutes)'))
  o = await onb('mia')
  expect(step(o, 'Event day briefing')!.status).toBe('done')
  expect(step(o, 'Event day briefing (30 minutes)')!.status).toBe('pending')
  await saveFlow({ type_id: typeId.Events }, EVENTS())
  expect(step(await onb('mia'), 'Event day briefing (30 minutes)')).toBeUndefined()
})

test('T18 progress list: counts and statuses for every volunteer (coordinator can see it)', async () => {
  await addPerson('noah', ['Events'])
  const r = await api(casey, 'GET', '/api/onboarding/progress')
  expect(r.status).toBe(200)
  const rows = r.body!.people as Array<{ employeeId: string; status: string; typeIds: string[]; resolved: number; total: number }>
  const row = (k: Key) => rows.find((p) => p.employeeId === emp[k])!
  expect(row('sam').status).toBe('approved')
  expect(row('priya').status).toBe('completed')
  expect(row('jordan').status).toBe('in_progress')
  expect(row('mia').status).toBe('in_progress')
  expect(row('noah').status).toBe('not_started')
  expect(row('priya').typeIds.sort()).toEqual([typeId['Op shop'], typeId.Events].sort())
  // Open: only the 2 optional steps (Food Safety Certificate, Meet your coordinator).
  expect(row('priya').total - row('priya').resolved, 'only optional steps are open').toBe(2)
})

test('T19 UI: progress page filters and bulk "give this type"', async ({ page }) => {
  await uiLogin(page, FX.admin.email)
  await page.goto(`${BASE}/dashboard/onboarding/progress`)
  await expect(page.getByTestId('progress-row')).toHaveCount(6)
  await shot(page, '06-progress-all')

  await page.getByLabel('Filter by volunteer type').selectOption({ label: 'Op shop' })
  await expect(page.getByTestId('progress-row')).toHaveCount(2)
  await page.getByLabel('Filter by volunteer type').selectOption('all')
  await page.getByLabel('Filter by onboarding status').selectOption({ label: 'Ready for approval' })
  await expect(page.getByTestId('progress-row')).toHaveCount(1)
  await expect(page.getByTestId('progress-row')).toContainText(PEOPLE.priya.name)
  await page.getByLabel('Filter by onboarding status').selectOption('all')

  await page.getByLabel(`Select ${PEOPLE.riley.name}`).check()
  await page.getByLabel(`Select ${PEOPLE.noah.name}`).check()
  await page.getByLabel('Volunteer type for selected people').selectOption({ label: 'Administration' })
  await shot(page, '07-progress-bulk-bar')
  await page.getByRole('button', { name: 'Give this type' }).click()
  await expect.poll(async () => (await onb('noah')).types.map((t) => t.name).sort()).toEqual(['Administration', 'Events'])
  expect((await onb('riley')).types.map((t) => t.name), 'Riley had it already').toEqual(['Administration'])

  const again = await api(admin, 'POST', '/api/people/volunteer-types', { employee_ids: [emp.noah, emp.riley], type_id: typeId.Administration, action: 'add' })
  expect(again.body!.changed, 'giving it again changes nothing').toBe(0)
  const rm = await api(admin, 'POST', '/api/people/volunteer-types', { employee_ids: [emp.noah], type_id: typeId.Administration, action: 'remove' })
  expect(rm.body!.changed).toBe(1)
  expect((await onb('noah')).types.map((t) => t.name)).toEqual(['Events'])
})

test('T20 rename and delete a type: open steps go, done steps stay', async () => {
  const r = await api(admin, 'POST', '/api/volunteer-types', { name: 'Warehouse' })
  const wid = (r.body!.type as { id: string }).id
  typeId.Warehouse = wid
  await saveFlow({ type_id: wid }, [manual('Forklift safety talk')])
  await api(admin, 'POST', '/api/people/volunteer-types', { employee_ids: [emp.mia, emp.noah], type_id: wid, action: 'add' })
  await markDone(step(await onb('mia'), 'Forklift safety talk')!.id)

  expect((await api(admin, 'PATCH', `/api/volunteer-types/${wid}`, { name: 'Warehouse and logistics' })).status).toBe(200)
  expect((await onb('mia')).types.map((t) => t.name)).toContain('Warehouse and logistics')
  expect((await api(casey, 'DELETE', `/api/volunteer-types/${wid}`)).status, 'coordinator cannot delete').toBe(403)

  expect((await api(admin, 'DELETE', `/api/volunteer-types/${wid}`)).status).toBe(200)
  expect(step(await onb('noah'), 'Forklift safety talk'), 'open copy removed').toBeUndefined()
  const mia = await onb('mia')
  expect(step(mia, 'Forklift safety talk')!.status, 'done copy stays').toBe('done')
  expect(mia.types.map((t) => t.name)).toEqual(['Events'])
})

test('T21 permissions: what a volunteer and a coordinator can and cannot do', async () => {
  const vol = await tokenFor(PEOPLE.sam.email)
  const anyStep = (await onb('jordan')).steps[0].id
  const volunteerCalls: Array<[string, string, unknown?]> = [
    ['POST', '/api/volunteer-types', { name: 'Nope' }],
    ['PUT', '/api/onboarding/templates', { type_id: typeId.Events, steps: [] }],
    ['GET', '/api/onboarding/progress'],
    ['POST', '/api/onboarding/approval', { employee_id: emp.sam, action: 'approve' }],
    ['PUT', `/api/people/${emp.sam}/volunteer-types`, { type_ids: [] }],
    ['POST', '/api/people/volunteer-types', { employee_ids: [emp.sam], type_id: typeId.Events, action: 'add' }],
    ['POST', '/api/onboarding/steps', { employee_id: emp.sam, title: 'x', step_type: 'manual' }],
    ['PATCH', `/api/onboarding/steps/${anyStep}`, { status: 'done' }],
    ['GET', `/api/onboarding?employee_id=${emp.priya}`],
  ]
  for (const [m, p, b] of volunteerCalls) expect((await api(vol, m, p, b)).status, `volunteer ${m} ${p}`).toBe(403)

  expect((await api(casey, 'GET', '/api/onboarding/progress')).status).toBe(200)
  expect((await api(casey, 'PUT', '/api/onboarding/templates', { type_id: typeId.Events, steps: EVENTS() })).status, 'coordinator cannot edit flows').toBe(403)
  expect((await api(casey, 'PUT', `/api/people/${emp.noah}/volunteer-types`, { type_ids: [] })).status, 'coordinator cannot change types').toBe(403)
  expect((await api(null, 'GET', '/api/volunteer-types')).status, 'not signed in').toBe(401)
})

test('T22 tenant isolation: another tenant\'s types and people are out of reach', async () => {
  const { data: before } = await sb.from('ess_volunteer_types').select('id, name, updated_at').eq('id', FOREIGN_TYPE_ID).single()
  const list = (await api(admin, 'GET', '/api/volunteer-types')).body!.types as Array<{ id: string }>
  expect(list.map((t) => t.id)).not.toContain(FOREIGN_TYPE_ID)
  expect((await api(admin, 'PUT', `/api/people/${emp.noah}/volunteer-types`, { type_ids: [FOREIGN_TYPE_ID] })).status).toBe(400)
  expect((await api(admin, 'PATCH', `/api/volunteer-types/${FOREIGN_TYPE_ID}`, { name: 'hacked' })).status).toBe(404)
  expect((await api(admin, 'DELETE', `/api/volunteer-types/${FOREIGN_TYPE_ID}`)).status).toBe(404)
  expect([400, 404]).toContain((await api(admin, 'PUT', '/api/onboarding/templates', { type_id: FOREIGN_TYPE_ID, steps: [] })).status)
  expect((await api(admin, 'POST', '/api/onboarding/approval', { employee_id: FOREIGN_EMPLOYEE_ID, action: 'approve' })).status).toBe(404)
  // Every read is filtered by the caller's tenant: the answer is empty, no data leaks.
  const foreignOnb = await api(admin, 'GET', `/api/onboarding?employee_id=${FOREIGN_EMPLOYEE_ID}`)
  if (foreignOnb.status === 200) expect(foreignOnb.body).toEqual({ state: null, steps: [], types: [] })
  else expect([403, 404]).toContain(foreignOnb.status)
  expect([400, 404]).toContain((await api(admin, 'POST', '/api/onboarding/steps', { employee_id: FOREIGN_EMPLOYEE_ID, title: 'x', step_type: 'manual' })).status)
  const { data: after } = await sb.from('ess_volunteer_types').select('id, name, updated_at').eq('id', FOREIGN_TYPE_ID).single()
  expect(after, 'the other tenant\'s type did not change').toEqual(before)
})

test('T23 UI: admin works on one person (mark done, add a step, not needed) until ready for approval', async ({ page }) => {
  await uiLogin(page, FX.admin.email)
  await page.goto(`${BASE}/dashboard/people/${emp.riley}`)
  await page.getByRole('button', { name: 'Onboarding', exact: true }).click()
  await expect(page.getByTestId('person-types')).toContainText('Administration')
  await shot(page, '08-person-page-start')

  // Add a step for this person only.
  await page.getByRole('button', { name: /Add a step for this person/ }).click()
  await page.locator('#ps-title').fill('Building access card')
  await page.getByRole('button', { name: 'Add step', exact: true }).click()
  await expect(page.getByText('Building access card')).toBeVisible()

  // "Not needed" with a reason.
  const row = (t: string) => page.getByTestId('person-step').filter({ hasText: t })
  await row('Meet your coordinator').getByRole('button', { name: 'Not needed' }).click()
  await page.getByLabel('Reason this step is not needed').fill('Met the coordinator at the interview')
  await page.getByRole('button', { name: 'Confirm not needed' }).click()
  await expect(row('Meet your coordinator')).toContainText('Not needed')

  // Mark the mandatory steps done, one by one.
  for (let i = 0; i < 12; i++) {
    const open = (await onb('riley')).steps.filter((s) => s.is_required && s.status === 'pending')
    if (open.length === 0) break
    await row(open[0].title).getByRole('button', { name: 'Mark done' }).click()
    // Undo shows for manual steps only, so wait for "Mark done" to go away.
    await expect(row(open[0].title).getByRole('button', { name: 'Mark done' })).toHaveCount(0)
  }
  await expect(page.getByTestId('approval-text')).toContainText('ready for approval')
  await expect(page.getByRole('button', { name: /^Approve$/ })).toBeEnabled()
  await shot(page, '09-person-page-ready-for-approval')
  const o = await onb('riley')
  expect(o.state!.status).toBe('completed')
  expect(step(o, 'Building access card')!.origin).toBe('personal')
  expect(step(o, 'Meet your coordinator')).toMatchObject({ status: 'skipped', waive_reason: 'Met the coordinator at the interview' })
})

test('T24 UI: the volunteer sees "Waiting for approval", the admin approves, the volunteer sees "Approved"', async ({ browser }) => {
  const vctx = await browser.newContext()
  const vpage = await vctx.newPage()
  await uiLogin(vpage, PEOPLE.priya.email)
  await vpage.goto(`${BASE}/dashboard/onboarding`)
  await expect(vpage.getByText('Your volunteer types:')).toBeVisible()
  await expect(vpage.getByText('Waiting for approval').first()).toBeVisible()
  await expect(vpage.getByText('Optional').first()).toBeVisible()
  await expect(vpage.getByText('Not needed').first()).toBeVisible()
  await shot(vpage, '10-volunteer-waiting-for-approval')

  const actx = await browser.newContext()
  const apage = await actx.newPage()
  await uiLogin(apage, FX.admin.email)
  await apage.goto(`${BASE}/dashboard/people/${emp.priya}`)
  await apage.getByRole('button', { name: 'Onboarding', exact: true }).click()
  await apage.getByRole('button', { name: /^Approve$/ }).click()
  await expect(apage.getByTestId('approval-text')).toContainText('Approved by')
  await shot(apage, '11-person-page-approved')

  await vpage.reload()
  await expect(vpage.getByText('Approved').first()).toBeVisible({ timeout: 20_000 })
  await shot(vpage, '12-volunteer-approved')
  await vctx.close(); await actx.close()
  expect(await statusOf('priya')).toBe('approved')
})

test('T25 final demo state', async () => {
  const want: Partial<Record<Key, string>> = { sam: 'approved', priya: 'approved', riley: 'completed', jordan: 'in_progress', mia: 'in_progress', noah: 'not_started' }
  for (const [k, s] of Object.entries(want)) expect(await statusOf(k as Key), k).toBe(s)
})
