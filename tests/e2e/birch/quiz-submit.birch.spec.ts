/**
 * Birch E2E — quiz attempt → submit → training-item completion (regression guard).
 * The onboarding-autocomplete gate uses the direct quiz-result hook, so it never
 * exercised the real attempt/submit path — which broke in prod because the
 * ess_quiz_answers unique index (ON CONFLICT attempt_id,question_id) was missing
 * from the DB, making every submit 500. This proves the full runtime chain.
 */
import { test, expect, tokenFor, api, FX, sbAdmin } from './birch-fixtures'

test.describe.configure({ mode: 'serial' })

const createdAttemptIds: string[] = []
let quizId = ''
let questions: { id: string; correctOptionId: string }[] = []

test.beforeAll(async () => {
  const quizItemId = FX.onboarding.modules.induction.items.quiz
  const { data: item } = await sbAdmin.from('ess_training_items').select('quiz_id').eq('id', quizItemId).single()
  quizId = item!.quiz_id as string
  const { data: qs } = await sbAdmin.from('ess_quiz_questions').select('id').eq('quiz_id', quizId).order('sort_order')
  questions = []
  for (const q of qs ?? []) {
    const { data: opts } = await sbAdmin.from('ess_quiz_options').select('id, is_correct').eq('question_id', q.id)
    const correct = (opts ?? []).find((o) => o.is_correct) ?? (opts ?? [])[0]
    questions.push({ id: q.id as string, correctOptionId: correct.id as string })
  }
})

test.afterAll(async () => {
  if (createdAttemptIds.length) await sbAdmin.from('ess_quiz_attempts').delete().in('id', createdAttemptIds) // cascades answers
})

test('a volunteer can start, answer and SUBMIT a quiz, completing the training item', async () => {
  const tok = await tokenFor(FX.users.volOpshop.email)
  const quizItemId = FX.onboarding.modules.induction.items.quiz

  // Start an attempt.
  const start = await api(tok, 'POST', '/api/quiz-attempts', { quiz_id: quizId, training_item_id: quizItemId })
  expect([200, 201], `start -> ${start.status}: ${JSON.stringify(start.body)}`).toContain(start.status)
  const attemptId = (start.body?.attempt as { id?: string } | undefined)?.id
  expect(attemptId, 'attempt created').toBeTruthy()
  createdAttemptIds.push(attemptId!)

  // Submit correct answers — this hits the ess_quiz_answers upsert that was failing.
  const submit = await api(tok, 'POST', `/api/quiz-attempts/${attemptId}/submit`, {
    answers: questions.map((q) => ({ question_id: q.id, selected_option_ids: [q.correctOptionId] })),
    time_spent_seconds: 15,
  })
  expect(submit.status, `submit -> ${submit.status}: ${JSON.stringify(submit.body)}`).toBe(200)
  const attempt = submit.body?.attempt as { passed?: boolean; score?: number; status?: string } | undefined
  expect(attempt?.passed, 'all-correct submission passes').toBe(true)
  expect(attempt?.score).toBe(100)

  // The quiz training item is now complete.
  const { data: ip } = await sbAdmin
    .from('ess_training_item_progress')
    .select('status')
    .eq('employee_id', FX.users.volOpshop.employeeId)
    .eq('item_id', quizItemId)
    .maybeSingle()
  expect(ip?.status, 'quiz item completes after passing').toBe('complete')
})
