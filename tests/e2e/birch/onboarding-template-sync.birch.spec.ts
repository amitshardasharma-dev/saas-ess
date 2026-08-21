/**
 * Saving an onboarding flow must apply to people who ALREADY exist, not just
 * future joiners — otherwise a newly required policy silently skips everyone
 * already on the books.
 *
 * Guards the two structural rules the sync must never break:
 *   1. a step added to the flow appears on people who already exist
 *   2. removing a step never deletes a COMPLETED copy (that is evidence)
 *
 * Runs against the STAFF flow on purpose: several other specs assert the exact
 * shape of the volunteer checklist, so mutating that one would race with them.
 * The flow is restored in afterAll.
 */
import { test, expect, tokenFor, api, FX, sbAdmin } from './birch-fixtures'

test.describe.configure({ mode: 'serial' })

type Step = { title: string; description: string | null; step_type: string; ref_id: string | null; auto_complete: boolean }

let admin = ''
let original: Step[] = []
const PROBE = 'Sync probe — safe to ignore'

const strip = (steps: Array<Record<string, unknown>>): Step[] =>
  steps.map((s) => ({
    title: s.title as string,
    description: (s.description as string) ?? null,
    step_type: s.step_type as string,
    ref_id: (s.ref_id as string) ?? null,
    auto_complete: Boolean(s.auto_complete),
  }))

const load = async () =>
  strip(
    ((await api(admin, 'GET', '/api/onboarding/templates')).body as {
      templates: { staff: { steps: Array<Record<string, unknown>> } }
    }).templates.staff.steps,
  )

const save = async (steps: Step[]) =>
  ((await api(admin, 'PUT', '/api/onboarding/templates', { audience: 'staff', steps })).body as {
    sync?: { people: number; added: number; removed: number; autoCompleted: number }
  }).sync

const probeRows = async () =>
  (
    await sbAdmin
      .from('ess_onboarding_steps')
      .select('id, employee_id, status')
      .eq('company_id', FX.companyId)
      .not('employee_id', 'is', null)
      .eq('title', PROBE)
  ).data ?? []

test.beforeAll(async () => {
  admin = await tokenFor(FX.users.admin.email)
  original = await load()
})

test.afterAll(async () => {
  if (admin && original.length) await save(original)
  // Belt and braces: drop any probe copies the sync intentionally preserved.
  await sbAdmin.from('ess_onboarding_steps').delete().eq('company_id', FX.companyId).eq('title', PROBE)
})

test('a step added to the flow reaches people who already exist', async () => {
  const sync = await save([...original, { title: PROBE, description: null, step_type: 'manual', ref_id: null, auto_complete: false }])
  expect(sync, 'the save reports what it synced').toBeTruthy()
  expect(sync!.added, 'pushed to existing staff').toBeGreaterThan(0)

  const rows = await probeRows()
  expect(rows.length, 'existing staff now carry the new step').toBeGreaterThan(0)
  expect(rows.every((r) => (r as { status: string }).status === 'pending'), 'a brand-new step starts pending').toBe(true)
})

test('removing a step deletes only incomplete copies — completed ones are evidence', async () => {
  const rows = await probeRows()
  expect(rows.length, 'previous test left the probe in place').toBeGreaterThan(1)

  // Mark exactly one person's copy complete, then take the step out of the flow.
  const completed = rows[0] as { id: string; employee_id: string }
  await sbAdmin
    .from('ess_onboarding_steps')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', completed.id)

  const sync = await save(original)
  expect(sync!.removed, 'the incomplete copies are withdrawn').toBeGreaterThan(0)

  const left = await probeRows()
  expect(left.length, 'the completed copy survives').toBe(1)
  expect((left[0] as { status: string }).status, 'and is still done — never reset').toBe('done')
  expect((left[0] as { employee_id: string }).employee_id).toBe(completed.employee_id)
})
