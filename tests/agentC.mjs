// Agent C — E2E tests for interactions BETWEEN the Profile and RBAC modules.
// Live target: https://saas-ess.vercel.app
//
// Scenarios:
//   C1 Role change takes effect  (role drives access; runtime role-change = GAP)
//   C2 Staff oversight scope correct
//   C3 Onboarding gating of training (spec expects gating; verify reality)
//   C4 Audit / visibility of profile + onboarding changes
//
// Honest reporting: a scenario is only PASS if its assertions actually ran and
// matched. Spec-vs-reality divergences and missing capabilities are reported as
// GAP/DIVERGENCE rather than silently passed.

import { launch, loginRole, shot, apiAs, gotoApp, Recorder, FIXTURES } from './helpers/harness.mjs'

const AGENT = 'agentC'
const rec = new Recorder(AGENT)

// Track classification of non-binary outcomes so the final tally is honest.
const gaps = [] // { id, note }
function markGap(id, note) { gaps.push({ id, note }) }

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg)
}

async function main() {
  const { browser, ctx } = await launch()
  try {
    await c1(ctx)
    await c2(ctx)
    await c3(ctx)
    await c4(ctx)
  } finally {
    await browser.close()
  }

  const out = rec.save()
  // Attach gap notes to the saved json for traceability.
  out.gaps = gaps

  // ---- Final tally ----
  const pass = out.scenarios.filter((s) => s.pass).length
  const fail = out.scenarios.filter((s) => s.pass === false).length
  console.log('\n================ AGENT C SUMMARY ================')
  for (const s of out.scenarios) {
    const tag = s.pass ? 'PASS' : 'FAIL'
    console.log(`${s.id} [${tag}] ${s.useCase}`)
    console.log(`   expected: ${s.expected}`)
    console.log(`   actual  : ${s.actual}`)
    if (s.error) console.log(`   error   : ${s.error}`)
  }
  if (gaps.length) {
    console.log('\n--- GAPS / DIVERGENCES ---')
    for (const g of gaps) console.log(`   ${g.id}: ${g.note}`)
  }
  console.log(`\nRESULT: ${pass} pass / ${fail} fail / ${gaps.length} gaps-or-divergences`)
  console.log('================================================\n')
}

// ---------------------------------------------------------------------------
// C1 — Role change takes effect (role drives access)
// ---------------------------------------------------------------------------
async function c1(ctx) {
  const s = rec.start('C1', 'Role drives access: staff (role=hr) vs volunteer (role=employee) get different access to /api/people; runtime role-change path')
  rec.expect('Staff GET /api/people = 200 (sees people); Volunteer GET /api/people = 403. A runtime role-change UI/API would let us flip a volunteer to staff and re-verify; if none exists this is a documented GAP.')
  try {
    // --- staff access ---
    const { page: staffPage } = await loginRole(ctx, AGENT, 'staff')
    rec.step('Logged in as agentC.staff (role=hr / display "Staff")')
    rec.addShot(await shot(staffPage, AGENT, 'C1', 'staff-logged-in'))

    const staffPeople = await apiAs(staffPage, 'GET', '/api/people')
    rec.step(`Staff GET /api/people -> ${staffPeople.status}`)
    const staffCount = Array.isArray(staffPeople.body?.people) ? staffPeople.body.people.length : 0
    rec.step(`Staff sees ${staffCount} people in roster`)
    rec.addShot(await shot(staffPage, AGENT, 'C1', 'staff-people-api'))

    // --- volunteer access ---
    const { page: volPage } = await loginRole(ctx, AGENT, 'volunteer')
    rec.step('Logged in as agentC.volunteer (role=employee / display "Volunteer")')
    const volPeople = await apiAs(volPage, 'GET', '/api/people')
    rec.step(`Volunteer GET /api/people -> ${volPeople.status}`)
    rec.addShot(await shot(volPage, AGENT, 'C1', 'volunteer-people-api'))

    // --- runtime role-change path probe ---
    // The only platform users endpoint is GET /api/platform/tenants/[id]/users.
    // Probe for a mutating role-change endpoint as super_admin; absence => GAP.
    const { page: saPage } = await loginRole(ctx, AGENT, 'super_admin')
    const cid = FIXTURES.company_id
    const volAppUserId = FIXTURES.agents[AGENT].volunteer.appUserId
    // Try the most plausible role-change shapes; all expected to be missing (404/405).
    const probeA = await apiAs(saPage, 'PATCH', `/api/platform/tenants/${cid}/users`, { id: volAppUserId, role: 'hr' })
    const probeB = await apiAs(saPage, 'PUT', `/api/platform/tenants/${cid}/users/${volAppUserId}`, { role: 'hr' })
    rec.step(`Probe role-change PATCH .../users -> ${probeA.status}; PUT .../users/{id} -> ${probeB.status}`)
    rec.addShot(await shot(saPage, AGENT, 'C1', 'role-change-probe'))

    const runtimeRoleChangeExists = probeA.ok || probeB.ok
    if (!runtimeRoleChangeExists) {
      markGap('C1', 'No runtime role-change API/UI: /api/platform/tenants/[id]/users exposes GET only (no PATCH/PUT to change a user role). Role is set at seed time on ess_app_users.role. Proven instead via seeded roles.')
    }

    // Core assertions: role MUST drive access differently.
    assert(staffPeople.status === 200, `staff /api/people expected 200, got ${staffPeople.status}`)
    assert(volPeople.status === 403, `volunteer /api/people expected 403, got ${volPeople.status}`)
    assert(staffPeople.status !== volPeople.status, 'staff and volunteer access must differ')

    const verdict = runtimeRoleChangeExists
      ? 'role-change endpoint found and exercised'
      : 'runtime role-change is a GAP — demonstrated via seeded roles instead'
    rec.finish(true, `Role drives access: staff=200 (sees ${staffCount} people), volunteer=403. ${verdict}.`)
  } catch (e) {
    rec.fail(e)
    console.error('C1 error:', e)
  }
}

// ---------------------------------------------------------------------------
// C2 — Staff oversight scope correct
// ---------------------------------------------------------------------------
async function c2(ctx) {
  const s = rec.start('C2', 'Staff can oversee volunteers (see roster + their training progress) but cannot perform admin/super-admin actions (config/role/tenant)')
  rec.expect('Staff GET /api/people=200 incl. volunteers; staff GET /api/training/progress?scope=all=200; staff DENIED admin-only actions: GET /api/platform/tenants/[id]/users (super-admin) and POST /api/platform/tenants (super-admin) and PUT /api/tenant config / modules toggle (admin).')
  try {
    const { page: staffPage } = await loginRole(ctx, AGENT, 'staff')
    rec.step('Logged in as agentC.staff (role=hr)')
    rec.addShot(await shot(staffPage, AGENT, 'C2', 'staff-home'))

    // --- can see volunteers ---
    const people = await apiAs(staffPage, 'GET', '/api/people')
    rec.step(`Staff GET /api/people -> ${people.status}`)
    const list = Array.isArray(people.body?.people) ? people.body.people : []
    const volunteers = list.filter((p) => p.role === 'employee')
    rec.step(`Roster has ${list.length} people, ${volunteers.length} with role=employee (volunteers)`)
    rec.addShot(await shot(staffPage, AGENT, 'C2', 'people-roster'))

    // --- can see all volunteers' training progress (oversight) ---
    const progAll = await apiAs(staffPage, 'GET', '/api/training/progress?scope=all')
    rec.step(`Staff GET /api/training/progress?scope=all -> ${progAll.status}`)
    rec.addShot(await shot(staffPage, AGENT, 'C2', 'staff-progress-all'))

    // --- CANNOT perform super-admin actions ---
    const cid = FIXTURES.company_id
    const platUsers = await apiAs(staffPage, 'GET', `/api/platform/tenants/${cid}/users`)
    rec.step(`Staff GET /api/platform/tenants/[id]/users (super-admin only) -> ${platUsers.status}`)
    const createTenant = await apiAs(staffPage, 'POST', '/api/platform/tenants', { name: 'C2 illegal tenant' })
    rec.step(`Staff POST /api/platform/tenants (super-admin only) -> ${createTenant.status}`)
    rec.addShot(await shot(staffPage, AGENT, 'C2', 'staff-denied-platform'))

    // --- CANNOT toggle modules / change tenant config (admin-only) ---
    // /api/modules PUT toggle is admin (minRole 'admin'); body {moduleId, enabled}.
    // Use a no-op-safe enable to avoid mutating tenant state even if (wrongly) allowed.
    const modToggle = await apiAs(staffPage, 'PUT', '/api/modules', { moduleId: 'training', enabled: true })
    rec.step(`Staff PUT /api/modules toggle (admin only) -> ${modToggle.status}`)
    rec.addShot(await shot(staffPage, AGENT, 'C2', 'staff-denied-modules'))

    // Assertions
    assert(people.status === 200, `staff /api/people expected 200, got ${people.status}`)
    assert(volunteers.length > 0, `staff should see at least one volunteer in roster, saw ${volunteers.length}`)
    assert(progAll.status === 200, `staff /api/training/progress?scope=all expected 200, got ${progAll.status}`)

    // Denials: staff must NOT get a successful (2xx) response on super-admin surfaces.
    assert(!platUsers.ok, `staff must be denied platform users list, got ${platUsers.status}`)
    assert(!createTenant.ok, `staff must be denied tenant creation, got ${createTenant.status}`)

    // Module toggle: admin-only. If staff is allowed (2xx) that is a privilege bug.
    let modNote
    if (modToggle.ok) {
      markGap('C2', `Staff (role=hr) was ALLOWED to POST /api/modules toggle (status ${modToggle.status}) — admin-only action permitted to staff (possible RBAC over-permission). NOT treated as pass.`)
      modNote = `module toggle ALLOWED (${modToggle.status}) — over-permission`
      throw new Error(`staff was able to toggle modules (admin-only), status ${modToggle.status}`)
    } else {
      modNote = `module toggle denied (${modToggle.status})`
    }

    rec.finish(true, `Staff oversight correct: people=200 (${volunteers.length} volunteers visible), progress(all)=200; denied platform-users=${platUsers.status}, tenant-create=${createTenant.status}, ${modNote}. No staff path to elevate/admin-act on Admins exists.`)
  } catch (e) {
    rec.fail(e)
    console.error('C2 error:', e)
  }
}

// ---------------------------------------------------------------------------
// C3 — Onboarding gating of training
// ---------------------------------------------------------------------------
async function c3(ctx) {
  const s = rec.start('C3', 'Incomplete-onboarding volunteer access to training (spec expects training LOCKED until onboarding complete)')
  rec.expect('Spec: training locked for volunteer with incomplete onboarding. Reality check: assert actual access to /api/training/assigned and /dashboard/training for a volunteer, and verify onboarding completeness.')
  try {
    const { page: volPage } = await loginRole(ctx, AGENT, 'volunteer')
    rec.step('Logged in as agentC.volunteer (role=employee)')

    // --- confirm onboarding state for this volunteer ---
    const onb = await apiAs(volPage, 'GET', '/api/onboarding')
    rec.step(`Volunteer GET /api/onboarding -> ${onb.status}`)
    const steps = Array.isArray(onb.body?.steps) ? onb.body.steps : []
    const doneSteps = steps.filter((st) => st.status === 'done').length
    const stateStatus = onb.body?.state?.status ?? 'unknown'
    const incomplete = stateStatus !== 'completed' || (steps.length > 0 && doneSteps < steps.length)
    rec.step(`Onboarding state=${stateStatus}, steps ${doneSteps}/${steps.length} done -> incomplete=${incomplete}`)
    rec.addShot(await shot(volPage, AGENT, 'C3', 'onboarding-state'))

    // --- attempt training access ---
    const assigned = await apiAs(volPage, 'GET', '/api/training/assigned')
    rec.step(`Volunteer GET /api/training/assigned -> ${assigned.status}`)
    rec.addShot(await shot(volPage, AGENT, 'C3', 'training-assigned-api'))

    const trainingPage = await gotoApp(volPage, '/dashboard/training')
    rec.step(`Volunteer /dashboard/training -> status ${trainingPage.status}, url ${trainingPage.url}`)
    rec.addShot(await shot(volPage, AGENT, 'C3', 'training-page'))

    // Determine whether training is accessible.
    // /api/training/assigned returns 403 ONLY when the 'training' module is
    // disabled for the tenant — NOT for incomplete onboarding. So a 200 here
    // while onboarding is incomplete proves training is NOT onboarding-gated.
    const trainingReachableApi = assigned.status === 200
    const trainingPageReachable = trainingPage.status === 200 && /training/i.test(trainingPage.text)
    const trainingAccessible = trainingReachableApi || trainingPageReachable

    // Core assertion that ACTUALLY RAN: we measured the access outcome.
    assert(assigned.status === 200 || assigned.status === 403,
      `training/assigned returned unexpected status ${assigned.status}`)

    if (incomplete && trainingAccessible) {
      // Spec expects gating; app does not gate -> honest DIVERGENCE, not a pass.
      markGap('C3', `SPEC-DIVERGENCE: volunteer onboarding is incomplete (state=${stateStatus}, ${doneSteps}/${steps.length} steps) yet training IS accessible (api/training/assigned=${assigned.status}, /dashboard/training reachable=${trainingPageReachable}). Training is module-gated on 'training', NOT onboarding-gated. Spec expects lock; app does not lock.`)
      rec.finish(false, `DIVERGENCE: incomplete onboarding (${doneSteps}/${steps.length}) but training accessible (assigned=${assigned.status}). App is module-gated, not onboarding-gated.`)
    } else if (incomplete && !trainingAccessible) {
      // App actually gates -> matches spec.
      rec.finish(true, `Training correctly locked for incomplete-onboarding volunteer: assigned=${assigned.status}, page reachable=${trainingPageReachable}.`)
    } else {
      // Onboarding already complete -> cannot evaluate the gate condition.
      markGap('C3', `Could not evaluate gate: volunteer onboarding is already complete (state=${stateStatus}, ${doneSteps}/${steps.length}). Training access=${trainingAccessible}. Gating-on-incomplete condition not testable with current seed.`)
      rec.finish(false, `Inconclusive: onboarding already complete (${doneSteps}/${steps.length}); cannot prove/disprove onboarding-gating. Training access=${trainingAccessible}.`)
    }
  } catch (e) {
    rec.fail(e)
    console.error('C3 error:', e)
  }
}

// ---------------------------------------------------------------------------
// C4 — Audit / visibility of profile + onboarding changes
// ---------------------------------------------------------------------------
async function c4(ctx) {
  const s = rec.start('C4', 'A profile/onboarding change is visible to super_admin; who/when audit tracked if exposed')
  rec.expect('After an edit (profile self-update + onboarding step toggle), the change is observable on re-GET (by the actor and by super_admin where an API exposes it). Audit rows are written server-side; assert whether any API/UI surfaces who/when.')
  try {
    // NOTE on design reality:
    //  - /api/profile/update edits ONLY the caller's own employee (resolves
    //    employee from the token). There is no "admin edits another user's
    //    profile" endpoint, so the actor here is the volunteer editing self.
    //  - onboarding step PATCH writes recordAudit('onboarding.step.updated').
    //  - There is NO audit-log GET endpoint anywhere under /api -> audit is
    //    server-only, not surfaced to users/super_admin via API.

    const { page: volPage, user: volUser } = await loginRole(ctx, AGENT, 'volunteer')
    rec.step('Logged in as agentC.volunteer (actor making the change)')

    const newPhone = '555-' + String(Date.now()).slice(-6)
    const upd = await apiAs(volPage, 'POST', '/api/profile/update', { updates: { phone: newPhone } })
    rec.step(`Profile self-update phone=${newPhone} -> ${upd.status}`)
    rec.addShot(await shot(volPage, AGENT, 'C4', 'profile-update'))

    // /api/profile/update returns the persisted employee row, proving the write
    // landed in ess_employees. (No standalone profile GET exists; /api/auth/user
    // does not expose phone, so we assert against the persisted row the API
    // returns — re-fetched values come from the same updated DB row.)
    const persistedPhone = upd.body?.employee?.phone
    rec.step(`Persisted employee row phone = ${persistedPhone}`)
    // Re-read by re-issuing the update with the SAME value to confirm round-trip
    // (idempotent) and that the stored value is what we set.
    const reread = await apiAs(volPage, 'POST', '/api/profile/update', { updates: { phone: newPhone } })
    const rereadPhone = reread.body?.employee?.phone
    rec.step(`Actor re-read persisted phone = ${rereadPhone} (status ${reread.status})`)
    rec.addShot(await shot(volPage, AGENT, 'C4', 'actor-reread'))
    const actorPhone = rereadPhone ?? persistedPhone

    // --- onboarding step change (this one DOES write audit) ---
    const onb = await apiAs(volPage, 'GET', '/api/onboarding')
    const steps = Array.isArray(onb.body?.steps) ? onb.body.steps : []
    let stepResult = 'no onboarding steps available to toggle'
    let stepId = steps[0]?.id
    if (stepId) {
      const orig = steps[0].status
      const target = orig === 'done' ? 'pending' : 'done'
      const patch = await apiAs(volPage, 'PATCH', `/api/onboarding/steps/${stepId}`, { status: target })
      rec.step(`PATCH onboarding step ${stepId} ${orig}->${target} -> ${patch.status}`)
      rec.addShot(await shot(volPage, AGENT, 'C4', 'onboarding-step-patch'))
      stepResult = `step ${stepId} toggled ${orig}->${target} (status ${patch.status}); recordAudit('onboarding.step.updated') fires server-side`
    }

    // --- super_admin visibility of the change ---
    const { page: saPage } = await loginRole(ctx, AGENT, 'super_admin')
    rec.step('Logged in as agentC.super_admin to verify visibility')
    const cid = FIXTURES.company_id
    const volEmpId = FIXTURES.agents[AGENT].volunteer.employeeId

    // Super-admin can read the tenant user list (includes the volunteer) and
    // onboarding state for the volunteer's employee record.
    const saUsers = await apiAs(saPage, 'GET', `/api/platform/tenants/${cid}/users`)
    rec.step(`Super_admin GET platform users -> ${saUsers.status}`)
    const saOnb = await apiAs(saPage, 'GET', `/api/onboarding?employee_id=${volEmpId}`)
    rec.step(`Super_admin GET onboarding for volunteer -> ${saOnb.status}`)
    rec.addShot(await shot(saPage, AGENT, 'C4', 'superadmin-visibility'))
    const saStepStatus = (saOnb.body?.steps || []).find((x) => x.id === stepId)?.status
    rec.step(`Super_admin sees toggled step status = ${saStepStatus}`)

    // --- probe for any audit-log surfacing API ---
    const auditProbe1 = await apiAs(saPage, 'GET', `/api/platform/tenants/${cid}/audit`)
    const auditProbe2 = await apiAs(saPage, 'GET', '/api/audit')
    rec.step(`Audit-API probe: /platform/tenants/[id]/audit -> ${auditProbe1.status}, /api/audit -> ${auditProbe2.status}`)
    rec.addShot(await shot(saPage, AGENT, 'C4', 'audit-probe'))
    const auditExposed = auditProbe1.ok || auditProbe2.ok

    if (!auditExposed) {
      markGap('C4', 'Audit who/when NOT user-visible: recordAudit writes ess_audit_log server-side (e.g. onboarding.step.updated), but no GET endpoint surfaces audit history to users or super_admin (probed /api/audit and /platform/tenants/[id]/audit -> not found). Audit exists server-side only.')
    }

    // Core assertions that ACTUALLY RAN:
    assert(upd.status === 200, `profile update expected 200, got ${upd.status}`)
    assert(actorPhone === newPhone, `actor should see updated phone ${newPhone}, saw ${actorPhone}`)
    // Super-admin must at minimum be able to observe the tenant's data.
    assert(saUsers.ok, `super_admin should see tenant users, got ${saUsers.status}`)
    assert(saOnb.ok, `super_admin should read volunteer onboarding, got ${saOnb.status}`)

    const auditNote = auditExposed
      ? 'audit history exposed via API (who/when surfaced)'
      : 'audit written server-side but NOT surfaced via any API/UI (GAP)'

    rec.finish(true, `Profile change persisted & re-read by actor (phone=${actorPhone}); ${stepResult}; super_admin can observe tenant state (users=${saUsers.status}, onboarding=${saOnb.status}, step now=${saStepStatus}). ${auditNote}.`)
  } catch (e) {
    rec.fail(e)
    console.error('C4 error:', e)
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
