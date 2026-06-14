// E2E QA — LMS (Training, Phase 5) + Quizzes/Grading (Phase 6)
// Live prod target. Run: node e2e/lms-tests.mjs
// Writes e2e/results/lms.json + screenshots to e2e/shots/.

import { writeFileSync } from 'fs'
import { launch, loginAs, visit, apiGet, BASE } from './helper.mjs'

const results = []
const add = (name, pass, detail, severity) =>
  results.push({ name, pass, detail, ...(severity ? { severity } : {}) })

// POST/PUT/DELETE helper (helper.mjs only has apiGet).
async function apiSend(page, method, path, body) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const t = localStorage.getItem('ess_access_token')
      const r = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(t ? { Authorization: 'Bearer ' + t } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      let resBody = null
      try { resBody = await r.json() } catch { resBody = null }
      return { status: r.status, ok: r.ok, body: resBody }
    },
    { method, path, body }
  )
}

const short = (o) => JSON.stringify(o)?.slice(0, 300)

const { browser, ctx } = await launch()
try {
  // ---- Login as staff (admin has hr+ powers) ----
  const { page, loginResult, errors: loginErr } = await loginAs(ctx, 'admin')
  if (loginResult.ok) add('login-admin', true, `role=${loginResult.role}`)
  else { add('login-admin', false, `login failed ${short(loginResult)}`, 'blocker'); throw new Error('login failed') }

  // =====================================================================
  // 1. TRAINING APIs
  // =====================================================================
  const modulesList = await apiGet(page, '/api/training/modules?manage=true')
  add('api-training-modules-list', modulesList.status === 200 && Array.isArray(modulesList.body?.modules),
    `status=${modulesList.status} shape=${modulesList.body ? Object.keys(modulesList.body) : 'null'} count=${modulesList.body?.modules?.length}`,
    modulesList.status === 200 ? undefined : 'high')

  const assigned = await apiGet(page, '/api/training/assigned')
  add('api-training-assigned', assigned.status === 200,
    `status=${assigned.status} body=${short(assigned.body)}`,
    assigned.status === 200 ? undefined : 'high')

  const progress = await apiGet(page, '/api/training/progress')
  add('api-training-progress', progress.status === 200,
    `status=${progress.status} body=${short(progress.body)}`,
    progress.status === 200 ? undefined : 'medium')

  const groups = await apiGet(page, '/api/training/groups')
  add('api-training-groups', groups.status === 200,
    `status=${groups.status} body=${short(groups.body)}`,
    groups.status === 200 ? undefined : 'medium')

  // ---- Create a training module (persistence check) ----
  const modTitle = `E2E QA Module ${Date.now()}`
  const createMod = await apiSend(page, 'POST', '/api/training/modules', {
    title: modTitle,
    description: 'Created by automated LMS E2E test',
  })
  const newModId = createMod.body?.module?.id
  add('api-training-module-create', createMod.status === 201 && !!newModId,
    `status=${createMod.status} id=${newModId} body=${short(createMod.body)}`,
    createMod.status === 201 ? undefined : 'high')

  // Re-GET to confirm persistence.
  if (newModId) {
    const reList = await apiGet(page, '/api/training/modules?manage=true')
    const found = reList.body?.modules?.some((m) => m.id === newModId)
    add('api-training-module-persisted', !!found,
      `found=${found} after re-GET (total now ${reList.body?.modules?.length})`,
      found ? undefined : 'high')

    // Add a quiz-less doc item is hard (needs document_id); just verify module detail GET.
    const modDetail = await apiGet(page, `/api/training/modules/${newModId}`)
    add('api-training-module-detail', modDetail.status === 200,
      `status=${modDetail.status} body=${short(modDetail.body)}`,
      modDetail.status === 200 ? undefined : 'medium')
  }

  // =====================================================================
  // 2. QUIZ APIs + builder
  // =====================================================================
  const quizList = await apiGet(page, '/api/quizzes')
  add('api-quizzes-list', quizList.status === 200 && Array.isArray(quizList.body?.quizzes),
    `status=${quizList.status} count=${quizList.body?.quizzes?.length} keys=${quizList.body ? Object.keys(quizList.body) : 'null'}`,
    quizList.status === 200 ? undefined : 'high')

  // ---- Create a minimal quiz with one MC question ----
  const quizTitle = `E2E QA Quiz ${Date.now()}`
  const createQuiz = await apiSend(page, 'POST', '/api/quizzes', {
    title: quizTitle,
    description: 'Created by automated LMS E2E test',
    passing_score: 70,
    feedback_timing: 'after_submit',
    show_explanations: true,
    status: 'published',
    randomize_questions: false,
    questions: [
      {
        type: 'mc_single',
        prompt: 'What is 2 + 2?',
        points: 1,
        sort_order: 0,
        accepted_answers: [],
        options: [
          { label: '3', is_correct: false, sort_order: 0 },
          { label: '4', is_correct: true, sort_order: 1 },
        ],
      },
    ],
  })
  const newQuizId = createQuiz.body?.id
  add('api-quiz-create', createQuiz.status === 201 && !!newQuizId,
    `status=${createQuiz.status} id=${newQuizId} body=${short(createQuiz.body)}`,
    createQuiz.status === 201 ? undefined : 'high')

  // Re-GET list to confirm persistence.
  let quizForTake = newQuizId
  if (newQuizId) {
    const reQuiz = await apiGet(page, '/api/quizzes')
    const found = reQuiz.body?.quizzes?.some((q) => q.id === newQuizId)
    add('api-quiz-persisted', !!found,
      `found=${found} (total now ${reQuiz.body?.quizzes?.length})`,
      found ? undefined : 'high')

    // Quiz detail (builder edit load).
    const quizDetail = await apiGet(page, `/api/quizzes/${newQuizId}`)
    add('api-quiz-detail', quizDetail.status === 200 && quizDetail.body,
      `status=${quizDetail.status} hasQuestions=${Array.isArray(quizDetail.body?.questions) || Array.isArray(quizDetail.body?.quiz?.questions)} body=${short(quizDetail.body)}`,
      quizDetail.status === 200 ? undefined : 'medium')

    // Duplicate.
    const dup = await apiSend(page, 'POST', `/api/quizzes/${newQuizId}/duplicate`)
    add('api-quiz-duplicate', dup.status === 201 || dup.status === 200,
      `status=${dup.status} body=${short(dup.body)}`,
      dup.status < 400 ? undefined : 'medium')
  } else {
    // fall back to any existing quiz for the take-flow test
    quizForTake = quizList.body?.quizzes?.[0]?.id
  }

  // =====================================================================
  // 3. GRADING API
  // =====================================================================
  const grading = await apiGet(page, '/api/grading')
  add('api-grading-queue', grading.status === 200 && Array.isArray(grading.body?.items),
    `status=${grading.status} items=${grading.body?.items?.length} keys=${grading.body ? Object.keys(grading.body) : 'null'}`,
    grading.status === 200 ? undefined : 'high')

  // =====================================================================
  // 4. PAGE RENDERS (staff view)
  // =====================================================================
  const pages = [
    ['/dashboard/training', 'lms-training-volunteer'],
    ['/dashboard/training/manage', 'lms-training-manage'],
    ['/dashboard/training/reports', 'lms-training-reports'],
    ['/dashboard/quizzes', 'lms-quizzes-list'],
    ['/dashboard/quizzes/new', 'lms-quizzes-new'],
    ['/dashboard/grading', 'lms-grading'],
  ]
  for (const [path, shot] of pages) {
    const r = await visit(page, path, shot)
    const realErrors = r.errors.filter(
      (e) => !/favicon|net::ERR|Failed to load resource|ResizeObserver|hydrat/i.test(e)
    )
    const hasContent = r.bodyText && r.bodyText.trim().length > 30
    const notError = !/something went wrong|application error|404|not found|unhandled/i.test(r.bodyText || '')
    const pass = r.status === 200 && hasContent && notError && realErrors.length === 0
    add(`page${path}`, pass,
      `status=${r.status} errs=${realErrors.length}${realErrors.length ? ' [' + realErrors.slice(0, 2).join(' || ') + ']' : ''} text="${(r.bodyText || '').replace(/\n+/g, ' | ').slice(0, 140)}"`,
      pass ? undefined : (r.status !== 200 || realErrors.length ? 'high' : 'medium'))
  }

  // ---- Manage detail page for the module we created ----
  if (newModId) {
    const r = await visit(page, `/dashboard/training/manage/${newModId}`, 'lms-training-manage-detail')
    const realErrors = r.errors.filter((e) => !/favicon|net::ERR|Failed to load resource|ResizeObserver|hydrat/i.test(e))
    const pass = r.status === 200 && realErrors.length === 0 && /module|E2E QA/i.test(r.bodyText || '')
    add('page-training-manage-detail', pass,
      `status=${r.status} errs=${realErrors.length} text="${(r.bodyText || '').replace(/\n+/g, ' | ').slice(0, 140)}"`,
      pass ? undefined : 'medium')
  }

  // ---- Quiz edit page ----
  if (newQuizId) {
    const r = await visit(page, `/dashboard/quizzes/${newQuizId}`, 'lms-quiz-edit')
    const realErrors = r.errors.filter((e) => !/favicon|net::ERR|Failed to load resource|ResizeObserver|hydrat/i.test(e))
    const badBody = /unauthorized|something went wrong|application error|failed to load/i.test(r.bodyText || '')
    const pass = r.status === 200 && realErrors.length === 0 && !badBody
    add('page-quiz-edit', pass,
      `status=${r.status} errs=${realErrors.length} text="${(r.bodyText || '').replace(/\n+/g, ' | ').slice(0, 140)}"`,
      pass ? undefined : 'medium')
  }

  // =====================================================================
  // 5. QUIZ TAKE FLOW (force-dynamic + Suspense page)
  // =====================================================================
  if (quizForTake) {
    const r = await visit(page, `/dashboard/training/quiz/${quizForTake}`, 'lms-quiz-take')
    const realErrors = r.errors.filter((e) => !/favicon|net::ERR|Failed to load resource|ResizeObserver|hydrat/i.test(e))
    const pass = r.status === 200 && realErrors.length === 0 && (r.bodyText || '').trim().length > 30
    add('page-quiz-take', pass,
      `quizId=${quizForTake} status=${r.status} errs=${realErrors.length}${realErrors.length ? ' [' + realErrors.slice(0, 2).join(' || ') + ']' : ''} text="${(r.bodyText || '').replace(/\n+/g, ' | ').slice(0, 140)}"`,
      pass ? undefined : 'high')
  } else {
    add('quizzes-seeded', false, 'No quizzes available (create failed AND none seeded) — checking graceful fake-id render', 'medium')
  }

  // ---- Take page with a fake/empty id (graceful failure check) ----
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const rFake = await visit(page, `/dashboard/training/quiz/${fakeId}`, 'lms-quiz-take-fake')
  const fakeRealErrors = rFake.errors.filter((e) => !/favicon|net::ERR|Failed to load resource|ResizeObserver|hydrat/i.test(e))
  const fakeGraceful = rFake.status === 200 && fakeRealErrors.length === 0
  add('page-quiz-take-fake-id', fakeGraceful,
    `status=${rFake.status} errs=${fakeRealErrors.length} text="${(rFake.bodyText || '').replace(/\n+/g, ' | ').slice(0, 140)}"`,
    fakeGraceful ? undefined : 'high')

  // =====================================================================
  // 6. VOLUNTEER/EMPLOYEE VIEW of training (assigned modules?)
  // =====================================================================
  const { page: empPage, loginResult: empLogin } = await loginAs(ctx, 'employee')
  if (empLogin.ok) {
    const empAssigned = await apiGet(empPage, '/api/training/assigned')
    add('api-training-assigned-employee', empAssigned.status === 200,
      `status=${empAssigned.status} count=${Array.isArray(empAssigned.body?.modules) ? empAssigned.body.modules.length : short(empAssigned.body)}`,
      empAssigned.status === 200 ? undefined : 'high')

    const empTraining = await visit(empPage, '/dashboard/training', 'lms-training-employee')
    const realErrors = empTraining.errors.filter((e) => !/favicon|net::ERR|Failed to load resource|ResizeObserver|hydrat/i.test(e))
    const pass = empTraining.status === 200 && realErrors.length === 0 && (empTraining.bodyText || '').trim().length > 30
    add('page-training-employee-view', pass,
      `status=${empTraining.status} errs=${realErrors.length} text="${(empTraining.bodyText || '').replace(/\n+/g, ' | ').slice(0, 140)}"`,
      pass ? undefined : 'medium')

    // Employee should NOT be able to create modules (RBAC).
    const empCreate = await apiSend(empPage, 'POST', '/api/training/modules', { title: 'EMPLOYEE-SHOULD-FAIL' })
    add('rbac-employee-cannot-create-module', empCreate.status === 403 || empCreate.status === 401,
      `status=${empCreate.status} (expect 401/403) body=${short(empCreate.body)}`,
      (empCreate.status === 403 || empCreate.status === 401) ? undefined : 'high')

    // Employee should NOT see grading queue.
    const empGrading = await apiGet(empPage, '/api/grading')
    add('rbac-employee-cannot-grade', empGrading.status === 403 || empGrading.status === 401,
      `status=${empGrading.status} (expect 401/403)`,
      (empGrading.status === 403 || empGrading.status === 401) ? undefined : 'high')
  } else {
    add('login-employee', false, `employee login failed ${short(empLogin)}`, 'high')
  }
} catch (e) {
  add('FATAL', false, String(e?.message || e), 'blocker')
} finally {
  await browser.close()
}

writeFileSync(
  '/Volumes/ssd2/projects/saas-ess/e2e/results/lms.json',
  JSON.stringify(results, null, 2)
)

const passN = results.filter((r) => r.pass).length
const failN = results.length - passN
console.log(`\n===== LMS E2E: ${passN} PASS / ${failN} FAIL (of ${results.length}) =====\n`)
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}${r.severity ? ' [' + r.severity + ']' : ''}  ${r.name}`)
  console.log(`      ${r.detail}`)
}
