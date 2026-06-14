/**
 * Birch E2E — GATE: typed/linked onboarding steps auto-complete from real
 * artifact events (BUG-002, blueprint §6 #1). Proves the FULL chain for the
 * dedicated Street-Outreach volunteer `volAuto` (kept separate so the other
 * specs' pristine-onboarding assertions are unaffected):
 *   doc_sign  -> e-sign the Volunteer Agreement + Code of Conduct
 *   doc_ack   -> acknowledge the Safeguarding Policy
 *   certification -> staff records Police Check + Blue Card
 *   training  -> complete the Induction (video+doc+quiz) + Safeguarding modules
 * Each matching step flips to done WITHOUT a manual tick; status rolls
 * not_started -> in_progress -> completed. Plus isolation: the same artifacts
 * never complete another volunteer's identically-linked step, and never advance
 * any cross-tenant onboarding. Localhost-only (BASE guard in birch-fixtures).
 */
import { test, expect, api, tokenFor, FX, FOREIGN_EMPLOYEE_ID, sbAdmin } from './birch-fixtures'

interface Step {
  id: string
  title: string
  status: 'pending' | 'done' | 'skipped'
  step_type: string
  ref_id: string | null
  auto_complete: boolean
  completed_at: string | null
}

const VOL = FX.users.volAuto
const OB = FX.onboarding

let volTok: string // the auto volunteer — signs / acks / completes training
let staffTok: string // hr — records certs + ticks the manual steps

async function readOnboarding(token: string): Promise<{ state: { status: string } | null; steps: Step[] }> {
  const r = await api(token, 'GET', '/api/onboarding')
  expect(r.status, `GET /api/onboarding -> ${r.status}`).toBe(200)
  return { state: (r.body?.state as { status: string } | null) ?? null, steps: (r.body?.steps as Step[]) ?? [] }
}
const byTitle = (steps: Step[], title: string) => steps.find((s) => s.title === title)

// Baselines captured before the chain runs, to prove no cross-volunteer /
// cross-tenant onboarding step is flipped by volAuto's artifact events.
let foreignDoneBaseline = 0

test.describe.serial('Onboarding auto-complete chain (BUG-002)', () => {
  test.beforeAll(async () => {
    volTok = await tokenFor(VOL.email)
    staffTok = await tokenFor(FX.users.staff.email)
    const { count } = await sbAdmin
      .from('ess_onboarding_steps')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', FOREIGN_EMPLOYEE_ID)
      .eq('status', 'done')
    foreignDoneBaseline = count ?? 0
  })

  test('renders 9 typed steps and starts not_started', async () => {
    const { state, steps } = await readOnboarding(volTok)
    expect(steps.length).toBe(9)
    expect(state?.status).toBe('not_started')
    const sign = byTitle(steps, 'Sign the Volunteer Agreement')!
    expect(sign.step_type).toBe('doc_sign')
    expect(sign.auto_complete).toBe(true)
    expect(sign.ref_id).toBe(OB.docs.volunteerAgreement.id)
    expect(sign.status).toBe('pending')
  })

  test('doc_sign: signing the Volunteer Agreement auto-completes its step (no manual tick)', async () => {
    const r = await api(volTok, 'POST', `/api/documents/${OB.docs.volunteerAgreement.id}/sign`, {
      versionId: OB.docs.volunteerAgreement.versionId,
      signerName: 'E2E Auto Vol',
      signatureType: 'typed',
      fieldValues: { signature: 'E2E Auto Vol' },
    })
    expect(r.status, `sign -> ${r.status}: ${JSON.stringify(r.body)}`).toBe(201)
    const { state, steps } = await readOnboarding(volTok)
    const step = byTitle(steps, 'Sign the Volunteer Agreement')!
    expect(step.status, 'agreement step should auto-complete').toBe('done')
    expect(step.completed_at).toBeTruthy()
    expect(state?.status, 'first completion moves status off not_started').toBe('in_progress')
  })

  test('doc_sign: signing the Code of Conduct auto-completes its step', async () => {
    const r = await api(volTok, 'POST', `/api/documents/${OB.docs.codeOfConduct.id}/sign`, {
      versionId: OB.docs.codeOfConduct.versionId,
      signerName: 'E2E Auto Vol',
      signatureType: 'typed',
      fieldValues: { signature: 'E2E Auto Vol' },
    })
    expect(r.status, `sign -> ${r.status}: ${JSON.stringify(r.body)}`).toBe(201)
    const { steps } = await readOnboarding(volTok)
    expect(byTitle(steps, 'Sign the Code of Conduct')!.status).toBe('done')
  })

  test('doc_ack: acknowledging the Safeguarding Policy auto-completes its step', async () => {
    const r = await api(volTok, 'POST', `/api/documents/${OB.docs.safeguardingPolicy.id}/acknowledge`)
    expect(r.status, `ack -> ${r.status}: ${JSON.stringify(r.body)}`).toBe(200)
    const { steps } = await readOnboarding(volTok)
    expect(byTitle(steps, 'Acknowledge the Safeguarding Policy')!.status).toBe('done')
  })

  test('certification: recording the Police Check auto-completes the cert step + lands in the register', async () => {
    const r = await api(staffTok, 'POST', '/api/certifications', {
      employee_id: VOL.employeeId,
      cert_type_id: OB.certTypes.policeCheck,
      title: 'National Police Check',
      completion_date: '2026-01-01',
    })
    expect(r.status, `cert -> ${r.status}: ${JSON.stringify(r.body)}`).toBe(201)
    const { steps } = await readOnboarding(volTok)
    expect(byTitle(steps, 'Upload your National Police Check')!.status).toBe('done')
    // lands in the compliance register
    const reg = await api(staffTok, 'GET', '/api/certifications?scope=all')
    const list = (reg.body?.certifications as { employee_id?: string; cert_type_id?: string }[]) ?? []
    expect(list.some((c) => c.employee_id === VOL.employeeId && c.cert_type_id === OB.certTypes.policeCheck)).toBeTruthy()
  })

  test('certification: recording the Blue Card auto-completes the cert step', async () => {
    const r = await api(staffTok, 'POST', '/api/certifications', {
      employee_id: VOL.employeeId,
      cert_type_id: OB.certTypes.blueCard,
      title: 'Blue Card',
      completion_date: '2026-01-01',
    })
    expect(r.status, `cert -> ${r.status}: ${JSON.stringify(r.body)}`).toBe(201)
    const { steps } = await readOnboarding(volTok)
    expect(byTitle(steps, 'Upload your Blue Card')!.status).toBe('done')
  })

  test('training: completing the Induction module (video + doc + quiz) auto-completes its step', async () => {
    const video = await api(volTok, 'POST', '/api/training/track', { item_id: OB.modules.induction.items.video, event: 'video_watched' })
    expect(video.status, `video -> ${video.status}: ${JSON.stringify(video.body)}`).toBe(200)
    const doc = await api(volTok, 'POST', '/api/training/track', { item_id: OB.modules.induction.items.document, event: 'doc_acknowledged' })
    expect(doc.status, `doc -> ${doc.status}: ${JSON.stringify(doc.body)}`).toBe(200)
    const quiz = await api(volTok, 'POST', '/api/training/quiz-result', { item_id: OB.modules.induction.items.quiz, passed: true, score: 100 })
    expect(quiz.status, `quiz -> ${quiz.status}: ${JSON.stringify(quiz.body)}`).toBe(200)
    const { steps } = await readOnboarding(volTok)
    expect(byTitle(steps, 'Complete Volunteer Induction training')!.status, 'training step completes only at module 100%').toBe('done')
  })

  test('training: completing the Safeguarding module auto-completes its step', async () => {
    const video = await api(volTok, 'POST', '/api/training/track', { item_id: OB.modules.safeguarding.items.video, event: 'video_watched' })
    expect(video.status, `sg video -> ${video.status}: ${JSON.stringify(video.body)}`).toBe(200)
    const { steps } = await readOnboarding(volTok)
    expect(byTitle(steps, 'Complete Safeguarding training')!.status).toBe('done')
  })

  test('status rollup: in_progress until the manual steps are ticked, then completed', async () => {
    const before = await readOnboarding(volTok)
    expect(before.state?.status, 'two manual steps still pending').toBe('in_progress')
    const pending = before.steps.filter((s) => s.status !== 'done')
    // only the non-auto steps remain: profile_field + manual
    expect(pending.map((s) => s.step_type).sort()).toEqual(['manual', 'profile_field'])

    for (const s of pending) {
      const t = await api(staffTok, 'PATCH', `/api/onboarding/steps/${s.id}`, { status: 'done' })
      expect(t.status, `tick ${s.title} -> ${t.status}`).toBe(200)
    }

    const after = await readOnboarding(volTok)
    expect(after.state?.status, 'all steps resolved -> completed').toBe('completed')
    expect(after.steps.every((s) => s.status === 'done')).toBe(true)
  })

  test('isolation: another volunteer with the SAME linked steps was NOT auto-completed', async () => {
    // volOpshop's steps share the same ref_ids (same template) yet must stay
    // pending — proof the wiring is keyed on employee_id, not just ref_id.
    const { data: steps } = await sbAdmin
      .from('ess_onboarding_steps')
      .select('status, auto_complete')
      .eq('employee_id', FX.users.volOpshop.employeeId)
    expect((steps ?? []).length).toBe(9)
    expect((steps ?? []).every((s) => s.status === 'pending'), 'volOpshop steps must be untouched').toBe(true)
    const { data: st } = await sbAdmin
      .from('ess_onboarding_states')
      .select('status')
      .eq('employee_id', FX.users.volOpshop.employeeId)
      .single()
    expect(st?.status).toBe('not_started')
  })

  test('isolation: no cross-tenant onboarding step was completed by the new wiring', async () => {
    const { count } = await sbAdmin
      .from('ess_onboarding_steps')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', FOREIGN_EMPLOYEE_ID)
      .eq('status', 'done')
    expect(count ?? 0, 'foreign-tenant done-count unchanged by our run').toBe(foreignDoneBaseline)
  })
})
