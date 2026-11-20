/**
 * Custom onboarding for each volunteer (Birch request):
 *   - volunteer types with their own flow; a person can have several types and
 *     a step in two flows shows once
 *   - a type change keeps done steps, adds new steps, removes open old steps
 *   - steps for one person only (never removed by a sync)
 *   - "not needed" for one person (admin only, recorded)
 *   - mandatory vs optional, and admin approval
 *   - progress list, bulk type assignment, and the volunteer's own view
 *
 * Runs in the `mosping` tenant. Creates its own types + volunteer and removes
 * them in afterAll. The base volunteer flow is NOT changed (other specs assert
 * its shape).
 */
import { test, expect, tokenFor, api, FX, sbAdmin, cleanupUser, BASE } from './birch-fixtures'

test.describe.configure({ mode: 'serial' })

const RUN = Date.now().toString(36)
const EMAIL = `e2e.vtypes.${RUN}@mosping.test`
const T = (s: string) => `${s} ${RUN}`

type Step = { id: string; title: string; status: string; is_required: boolean; origin: string; waived_by: string | null; waive_reason: string | null }
type Onb = { state: { status: string; approved_at: string | null } | null; steps: Step[]; types: { id: string; name: string }[] }

let admin = ''
let staff = ''
let volTok = ''
let opShop = ''
let events = ''
let empId = ''

const onb = async (tok = admin) =>
  (await api(tok, 'GET', `/api/onboarding${tok === volTok ? '' : `?employee_id=${empId}`}`)).body as unknown as Onb
const titles = (o: Onb) => o.steps.map((s) => s.title)
const byTitle = (o: Onb, t: string) => o.steps.find((s) => s.title === t)
const setTypes = async (ids: string[]) => {
  const r = await api(admin, 'PUT', `/api/people/${empId}/volunteer-types`, { type_ids: ids })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body as { sync: { added: number; removed: number } }
}
const manual = (title: string, is_required = true) => ({ title, description: null, step_type: 'manual', ref_id: null, auto_complete: false, is_required })

test.beforeAll(async () => {
  admin = await tokenFor(FX.users.admin.email)
  staff = await tokenFor(FX.users.staff.email) // role hr
})

test.afterAll(async () => {
  for (const id of [opShop, events]) if (id) await api(admin, 'DELETE', `/api/volunteer-types/${id}`)
  await cleanupUser(EMAIL)
  // Belt and braces: drop leftovers if a step above failed half way.
  await sbAdmin.from('ess_volunteer_types').delete().eq('company_id', FX.companyId).like('name', `% ${RUN}`)
})

test('an admin creates volunteer types and their flows', async () => {
  const a = await api(admin, 'POST', '/api/volunteer-types', { name: T('E2E Op shop') })
  expect(a.status, JSON.stringify(a.body)).toBe(201)
  opShop = (a.body!.type as { id: string }).id
  const b = await api(admin, 'POST', '/api/volunteer-types', { name: T('E2E Events') })
  events = (b.body!.type as { id: string }).id

  const dup = await api(admin, 'POST', '/api/volunteer-types', { name: T('e2e op SHOP') })
  expect(dup.status, 'type names are unique (case ignored)').toBe(409)

  const staffTry = await api(staff, 'POST', '/api/volunteer-types', { name: T('Nope') })
  expect(staffTry.status, 'only an admin creates types').toBe(403)

  expect((await api(admin, 'PUT', '/api/onboarding/templates', { type_id: opShop, steps: [manual(T('Manual handling')), manual(T('Cash policy')), manual(T('Shared step'))] })).status).toBe(200)
  expect((await api(admin, 'PUT', '/api/onboarding/templates', { type_id: events, steps: [manual(T('First aid')), manual(T('Shared step')), manual(T('Events optional'), false)] })).status).toBe(200)

  const tpl = (await api(admin, 'GET', '/api/onboarding/templates')).body as { types: Array<{ id: string; steps: unknown[] }> }
  expect(tpl.types.find((t) => t.id === events)?.steps.length).toBe(3)
})

test('a new volunteer with a type gets the base steps plus that type steps', async () => {
  const r = await api(admin, 'POST', '/api/people', { full_name: T('E2E Types Volunteer'), email: EMAIL, role: 'employee', password: FX.password, volunteer_type_ids: [opShop] })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  empId = (r.body!.person as { id: string }).id

  const o = await onb()
  expect(titles(o)).toEqual(expect.arrayContaining([T('Manual handling'), T('Cash policy'), T('Shared step')]))
  expect(titles(o)).not.toContain(T('First aid'))
  expect(o.steps.length, 'base volunteer steps are there too').toBeGreaterThan(3)
  expect(o.types.map((t) => t.id)).toEqual([opShop])
})

test('two types: a step in both flows shows one time', async () => {
  const res = await setTypes([opShop, events])
  expect(res.sync.added, 'First aid + Events optional').toBe(2)
  const o = await onb()
  expect(titles(o).filter((t) => t === T('Shared step'))).toHaveLength(1)
  expect(byTitle(o, T('Events optional'))!.is_required).toBe(false)
})

test('type change keeps done steps, removes open old-type steps', async () => {
  const before = await onb()
  const mh = byTitle(before, T('Manual handling'))!
  expect((await api(staff, 'PATCH', `/api/onboarding/steps/${mh.id}`, { status: 'done' })).status).toBe(200)

  const res = await setTypes([events])
  expect(res.sync.removed, 'Cash policy (open, op shop only) goes').toBe(1)
  const o = await onb()
  expect(byTitle(o, T('Manual handling'))?.status, 'done step stays').toBe('done')
  expect(byTitle(o, T('Cash policy')), 'open op-shop step removed').toBeUndefined()
  expect(byTitle(o, T('Shared step')), 'still wanted by Events').toBeTruthy()
})

test('a step for one person only survives every sync', async () => {
  const r = await api(admin, 'POST', '/api/onboarding/steps', { employee_id: empId, title: T('WWCC'), step_type: 'manual' })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  expect((await api(admin, 'POST', '/api/onboarding/steps', { employee_id: empId, title: T('WWCC'), step_type: 'manual' })).status, 'no duplicates').toBe(409)
  expect((await api(staff, 'POST', '/api/onboarding/steps', { employee_id: empId, title: 'x', step_type: 'manual' })).status, 'admin only').toBe(403)

  await setTypes([])
  const o = await onb()
  const wwcc = byTitle(o, T('WWCC'))!
  expect(wwcc.origin).toBe('personal')
  expect(byTitle(o, T('First aid')), 'Events steps went with the type').toBeUndefined()

  const flowStep = o.steps.find((s) => s.origin === 'flow' && s.status === 'pending')!
  expect((await api(admin, 'DELETE', `/api/onboarding/steps/${flowStep.id}`)).status, 'flow steps cannot be deleted').toBe(400)
  await setTypes([events])
})

test('"not needed" is admin only and is recorded', async () => {
  const o = await onb()
  const fa = byTitle(o, T('First aid'))!
  volTok = await tokenFor(EMAIL)

  expect((await api(volTok, 'PATCH', `/api/onboarding/steps/${fa.id}`, { status: 'done' })).status, 'a volunteer cannot tick steps').toBe(403)
  expect((await api(staff, 'PATCH', `/api/onboarding/steps/${fa.id}`, { status: 'skipped' })).status, 'staff cannot waive').toBe(403)
  const w = await api(admin, 'PATCH', `/api/onboarding/steps/${fa.id}`, { status: 'skipped', reason: 'Works only in the office' })
  expect(w.status).toBe(200)

  const after = await onb()
  const step = byTitle(after, T('First aid'))!
  expect(step.status).toBe('skipped')
  expect(step.waived_by).toBe(FX.users.admin.appUserId)
  expect(step.waive_reason).toBe('Works only in the office')

  // A sync must not add the waived step back.
  const tpl = ((await api(admin, 'GET', '/api/onboarding/templates')).body as { types: Array<{ id: string; steps: Array<Record<string, unknown>> }> }).types.find((t) => t.id === events)!
  await api(admin, 'PUT', '/api/onboarding/templates', { type_id: events, steps: tpl.steps.map((s) => ({ ...manual(s.title as string, s.is_required as boolean) })) })
  expect(byTitle(await onb(), T('First aid'))!.status).toBe('skipped')
})

test('approval: only when every mandatory step is resolved; optional steps do not block', async () => {
  const early = await api(admin, 'POST', '/api/onboarding/approval', { employee_id: empId, action: 'approve' })
  expect(early.status, 'mandatory steps are still open').toBe(409)

  const o = await onb()
  for (const s of o.steps.filter((x) => x.is_required && x.status === 'pending')) {
    const r = await api(admin, 'PATCH', `/api/onboarding/steps/${s.id}`, { status: 'done' })
    expect(r.status, s.title).toBe(200)
  }
  const ready = await onb()
  expect(byTitle(ready, T('Events optional'))!.status, 'optional left open').toBe('pending')
  expect(ready.state!.status).toBe('completed')

  expect((await api(staff, 'POST', '/api/onboarding/approval', { employee_id: empId, action: 'approve' })).status, 'admin only').toBe(403)
  const ok = await api(admin, 'POST', '/api/onboarding/approval', { employee_id: empId, action: 'approve' })
  expect(ok.status, JSON.stringify(ok.body)).toBe(200)

  const mineView = await onb(volTok)
  expect(mineView.state!.status, 'the volunteer sees approved').toBe('approved')
  expect(mineView.types.map((t) => t.name)).toEqual([T('E2E Events')])

  const prog = (await api(staff, 'GET', '/api/onboarding/progress')).body as { people: Array<{ employeeId: string; status: string; typeIds: string[]; resolved: number; total: number; approvedBy: string | null }> }
  const row = prog.people.find((p) => p.employeeId === empId)!
  expect(row.status).toBe('approved')
  expect(row.typeIds).toEqual([events])
  expect(row.total - row.resolved, 'only the optional step is open').toBe(1)
  expect(row.approvedBy).toBeTruthy()
})

test('an approved person keeps the approval when a new mandatory step appears', async () => {
  const r = await api(admin, 'POST', '/api/onboarding/steps', { employee_id: empId, title: T('New policy'), step_type: 'manual' })
  expect(r.status).toBe(201)
  let o = await onb()
  expect(o.state!.status).toBe('in_progress')
  expect(o.state!.approved_at, 'approval is kept').toBeTruthy()
  await api(admin, 'PATCH', `/api/onboarding/steps/${byTitle(o, T('New policy'))!.id}`, { status: 'done' })
  o = await onb()
  expect(o.state!.status, 'back to approved without a new approval').toBe('approved')

  const rev = await api(admin, 'POST', '/api/onboarding/approval', { employee_id: empId, action: 'revoke' })
  expect(rev.status).toBe(200)
  expect((await onb()).state!.status).toBe('completed')
})

test('bulk: give a type to many people at once', async () => {
  const r = await api(admin, 'POST', '/api/people/volunteer-types', { employee_ids: [empId], type_id: opShop, action: 'add' })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  expect(r.body!.changed).toBe(1)
  const again = await api(admin, 'POST', '/api/people/volunteer-types', { employee_ids: [empId], type_id: opShop, action: 'add' })
  expect(again.body!.changed, 'idempotent').toBe(0)
  expect((await onb()).types.map((t) => t.id).sort()).toEqual([opShop, events].sort())
})

test('isolation: a volunteer cannot read another person, another tenant type is rejected', async () => {
  const other = await api(volTok, 'GET', `/api/onboarding?employee_id=${FX.users.admin.employeeId}`)
  expect(other.status).toBe(403)
  const foreign = await api(admin, 'PUT', `/api/people/${empId}/volunteer-types`, { type_ids: ['00000000-0000-4000-8000-000000000000'] })
  expect(foreign.status).toBe(400)
})

test('UI: person page, flows page and progress page show the new controls', async ({ page }) => {
  // The bulk test gave Op shop back, so "Cash policy" is open again. Resolve it.
  const open = (await onb()).steps.filter((x) => x.is_required && x.status === 'pending')
  for (const s of open) await api(admin, 'PATCH', `/api/onboarding/steps/${s.id}`, { status: 'done' })
  expect((await onb()).state!.status).toBe('completed')

  await page.goto(`${BASE}/login`)
  await page.fill('#username', FX.users.admin.email)
  await page.fill('#password', FX.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/dashboard/)
  await page.waitForTimeout(5000)

  await page.goto(`${BASE}/dashboard/people/${empId}`)
  await page.getByRole('button', { name: 'Onboarding', exact: true }).click()
  await expect(page.getByText('Only for this person').first()).toBeVisible()
  await expect(page.getByTestId('person-types')).toContainText(T('E2E Events'))
  await expect(page.getByRole('button', { name: /Add a step for this person/ })).toBeVisible()
  await expect(page.getByTestId('approval-text')).toContainText('ready for approval')
  await page.getByRole('button', { name: /^Approve$/ }).click()
  await expect(page.getByTestId('approval-text')).toContainText('Approved by')
  await expect(page.getByRole('button', { name: /Revoke approval/ })).toBeVisible()

  await page.goto(`${BASE}/dashboard/onboarding/manage`)
  await expect(page.getByRole('tab', { name: new RegExp(T('E2E Op shop')) })).toBeVisible()
  await page.getByRole('tab', { name: new RegExp(T('E2E Events')) }).click()
  await expect(page.getByTestId('flow-step')).toHaveCount(3)

  await page.goto(`${BASE}/dashboard/onboarding/progress`)
  await page.getByLabel('Search people').fill(RUN)
  await expect(page.getByTestId('progress-row')).toHaveCount(1)
  await expect(page.getByTestId('progress-row')).toContainText('Approved')
})
