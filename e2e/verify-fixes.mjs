// Re-test the exact flows that were broken, against the freshly deployed prod.
import { launch, loginAs, visit, apiGet } from './helper.mjs'

const { browser, ctx } = await launch()
const out = []
function rec(name, pass, detail) { out.push({ name, pass, detail }); console.log((pass?'PASS':'FAIL')+' :: '+name+' :: '+detail) }

try {
  const { page } = await loginAs(ctx, 'admin')

  // 0. modules should be 17 again
  const mods = await apiGet(page, '/api/modules')
  const n = (mods.body?.modules_enabled||[]).length
  rec('modules enabled = 17', n === 17, `count=${n}`)

  // 1. onboarding (was 401 — no auth header)
  const onb = await visit(page, '/dashboard/onboarding', 'fix-onboarding')
  const onbBad = /could not load onboarding|http 401/i.test(onb.bodyText)
  rec('onboarding loads (no 401)', onb.status===200 && !onbBad && onb.errors.length===0,
      `status=${onb.status} errors=${onb.errors.length} text="${onb.bodyText.slice(0,80).replace(/\n/g,' ')}"`)

  // 2. e-sign sign page (was getDocumentFields crash). Need a real document id.
  const docs = await apiGet(page, '/api/documents')
  const docId = (docs.body?.documents||[])[0]?.id
  if (docId) {
    const sign = await visit(page, `/dashboard/documents/${docId}/sign`, 'fix-esign')
    const crash = /something went wrong|unexpected error/i.test(sign.bodyText) || sign.errors.some(e=>/getDocumentFields|is not a function/i.test(e))
    rec('e-sign sign page (no crash)', sign.status===200 && !crash, `status=${sign.status} errors=${sign.errors.length}`)
  } else { rec('e-sign sign page (no crash)', false, 'no document id available to test') }

  // 3. quiz take page (was quizService.getQuizForRuntime crash) — use any quiz or a fake id; page must not hard-crash
  const quizzes = await apiGet(page, '/api/quizzes')
  const qId = (quizzes.body?.quizzes||[])[0]?.id || '00000000-0000-0000-0000-000000000000'
  const quiz = await visit(page, `/dashboard/training/quiz/${qId}`, 'fix-quiz')
  const qcrash = quiz.errors.some(e=>/getQuizForRuntime|is not a function|Cannot read prop/i.test(e))
  rec('quiz take page (no undefined-method crash)', quiz.status===200 && !qcrash, `status=${quiz.status} errors=${quiz.errors.slice(0,2).join(' | ').slice(0,120)}`)

  // 4. volunteer training view (was 'supabaseKey is required')
  const train = await visit(page, '/dashboard/training', 'fix-training')
  const keycrash = train.errors.some(e=>/supabaseKey is required/i.test(e)) || /something went wrong/i.test(train.bodyText)
  rec('volunteer training view (no supabaseKey crash)', train.status===200 && !keycrash, `status=${train.status} errors=${train.errors.slice(0,2).join(' | ').slice(0,120)}`)

  // 5. expense claim create (was 500 — missing company_id)
  const create = await page.evaluate(async () => {
    const t = localStorage.getItem('ess_access_token')
    const r = await fetch('/api/expense-claims', { method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+t}, body: JSON.stringify({ title:'E2E verify claim', currency:'INR' }) })
    let b=null; try{b=await r.json()}catch{}
    return { status:r.status, body:b }
  })
  rec('expense claim create (no 500)', create.status>=200 && create.status<300, `status=${create.status} ${JSON.stringify(create.body).slice(0,150)}`)

  // 6. leave-type label fix — check the new-leave page shows real names not 'AL - AL'
  const lt = await apiGet(page, '/api/leave-types')
  const hasNames = (lt.body?.leave_types||[]).every(x=>x.leave_type_name)
  rec('leave-types have real names', hasNames, `e.g. ${(lt.body?.leave_types||[])[0]?.leave_type_name}`)

} finally {
  const p = out.filter(x=>x.pass).length, f = out.length-p
  console.log(`\nVERIFY RESULT: ${p} pass / ${f} fail`)
  await browser.close()
}
