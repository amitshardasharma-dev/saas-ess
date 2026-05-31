// scripts/seed-phase-6.ts
//
// Idempotent Phase 6 seed: an "Induction Knowledge Check" quiz with one question
// of every type, passing score 70, 2 attempts, 10-minute limit. When a matching
// Phase 5 induction quiz training item exists it is left to the runtime to link
// via training_item_id at attempt time — the quiz itself is the published anchor.
//
// DO NOT RUN automatically. Run manually with:  npx tsx scripts/seed-phase-6.ts
// Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in the env.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}
const db = createClient(url, serviceKey)

const QUIZ_TITLE = 'Induction Knowledge Check'

async function seed() {
  // Pick the first company to seed into (single-tenant dev convenience).
  const { data: company } = await db.from('ess_companies').select('id').limit(1).maybeSingle()
  if (!company) {
    console.error('No company found — seed core data first.')
    return
  }
  const companyId = company.id as string

  // Idempotent: reuse an existing quiz with the same title in this tenant.
  const { data: existing } = await db
    .from('ess_quizzes')
    .select('id')
    .eq('company_id', companyId)
    .eq('title', QUIZ_TITLE)
    .maybeSingle()

  let quizId = existing?.id as string | undefined
  if (!quizId) {
    const { data: quiz, error } = await db
      .from('ess_quizzes')
      .insert({
        company_id: companyId,
        title: QUIZ_TITLE,
        description: 'A short mixed-type check covering the volunteer induction.',
        passing_score: 70,
        attempt_limit: 2,
        randomize_questions: true,
        time_limit_seconds: 600,
        feedback_timing: 'after_submit',
        show_explanations: true,
        status: 'published',
      })
      .select('id')
      .single()
    if (error || !quiz) {
      console.error('Quiz insert failed:', error?.message)
      return
    }
    quizId = quiz.id as string
  } else {
    console.log('Quiz already exists; refreshing questions.')
    await db.from('ess_quiz_questions').delete().eq('quiz_id', quizId).eq('company_id', companyId)
  }

  const questions = [
    {
      type: 'mc_single',
      prompt: 'Who do you contact first in an emergency on site?',
      points: 1,
      explanation: 'The duty supervisor coordinates the emergency response.',
      accepted_answers: [] as string[],
      options: [
        { label: 'The duty supervisor', is_correct: true },
        { label: 'A fellow volunteer', is_correct: false },
        { label: 'No one', is_correct: false },
      ],
    },
    {
      type: 'mc_multi',
      prompt: 'Which of these are required PPE? (select all)',
      points: 2,
      explanation: 'Gloves and hi-vis are both mandatory.',
      accepted_answers: [],
      options: [
        { label: 'Gloves', is_correct: true },
        { label: 'Hi-vis vest', is_correct: true },
        { label: 'Sunglasses', is_correct: false },
      ],
    },
    {
      type: 'true_false',
      prompt: 'You must sign in at reception before starting a shift.',
      points: 1,
      explanation: 'Sign-in is required for safety roll-call.',
      accepted_answers: [],
      options: [
        { label: 'True', is_correct: true },
        { label: 'False', is_correct: false },
      ],
    },
    {
      type: 'short_answer',
      prompt: 'What is the name of our safeguarding policy (one word)?',
      points: 1,
      explanation: null,
      accepted_answers: ['safeguard', 'safeguarding'],
      options: [],
    },
    {
      type: 'essay',
      prompt: 'Describe a situation where you would escalate a concern, and why.',
      points: 5,
      explanation: null,
      accepted_answers: [],
      options: [],
    },
  ]

  let sort = 0
  for (const q of questions) {
    const { data: qRow, error: qErr } = await db
      .from('ess_quiz_questions')
      .insert({
        company_id: companyId,
        quiz_id: quizId,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        explanation: q.explanation,
        accepted_answers: q.accepted_answers,
        sort_order: sort++,
      })
      .select('id')
      .single()
    if (qErr || !qRow) {
      console.error('Question insert failed:', qErr?.message)
      continue
    }
    if (q.options.length > 0) {
      await db.from('ess_quiz_options').insert(
        q.options.map((o, i) => ({
          company_id: companyId,
          question_id: qRow.id as string,
          label: o.label,
          is_correct: o.is_correct,
          sort_order: i,
        }))
      )
    }
  }

  console.log(`Seeded quiz "${QUIZ_TITLE}" (${quizId}) for company ${companyId}.`)
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
