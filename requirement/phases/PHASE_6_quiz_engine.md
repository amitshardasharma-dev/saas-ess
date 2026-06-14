# Phase 6 — Quiz & Assessment Engine + No-Code Builder

> **Self-contained build doc.** Read `_SHARED_CONVENTIONS.md` first. Migration block:
> **`045`–`054`**. Brief modules: 6 (Quiz Engine), 7 (Quiz Admin Interface).
> Depends on Phase 5 (module container) **by contract** — build against the documented
> `ess_training_items.quiz_id` + `recordQuizResult(...)` interface, stub if needed.

---

## 1. Mission
1. **Question types** (all): MC single, MC multi, True/False, short answer, essay/long-form.
2. **Config** (all): passing score, attempt limit, randomization, time limit, feedback
   timing (immediate / after submission / after close), answer explanations.
3. **Auto-grading** for objective types; **manual-grade queue** for essay/short-answer.
4. **Quiz ↔ module link** — pass/fail feeds training completion (calls Phase 5 contract).
5. **No-code builder** — Staff create/edit/duplicate/delete quizzes via UI, no developer.

## 2. Owned files / namespace
- `src/app/dashboard/quizzes/**` (builder + manage) (new)
- `src/app/dashboard/training/quiz/**` (take-quiz runtime) (new; under training feature but
  in your own subfolder to avoid collision with Phase 5)
- `src/app/dashboard/grading/**` (manual-grade queue) (new)
- `src/components/quizzes/**` (new — builder, question editors, player, grading UI)
- `src/app/api/quizzes/**`, `src/app/api/quiz-attempts/**`, `src/app/api/grading/**` (new)
- `src/services/quiz.ts`, `src/types/quiz.ts` (new)
- `src/lib/quiz/**` (new — grading, randomization, timing)
- `src/config/nav/phase-6-quizzes.nav.tsx` + append PHASE-6 nav markers
- `supabase/migrations/045_*.sql`…`054_*.sql`
- `scripts/seed-phase-6.ts`

## 3. Migrations (block 045–054)
- **`045_quizzes.sql`**:
  - `ess_quizzes` — `id, company_id, title, description, passing_score numeric,
    attempt_limit int null, randomize_questions boolean, time_limit_seconds int null,
    feedback_timing text check in ('immediate','after_submit','after_close'),
    show_explanations boolean, status text check in ('draft','published','archived'),
    created_by, created_at, updated_at`.
  - `ess_quiz_questions` — `id, company_id, quiz_id, type text check in
    ('mc_single','mc_multi','true_false','short_answer','essay'), prompt text,
    points numeric default 1, explanation text null, sort_order`.
  - `ess_quiz_options` — for MC/TF: `id, company_id, question_id, label text,
    is_correct boolean, sort_order`.
- **`046_quiz_attempts.sql`**:
  - `ess_quiz_attempts` — `id, company_id, quiz_id, employee_id, training_item_id uuid null,
    attempt_no int, status text check in ('in_progress','submitted','graded'),
    score numeric null, passed boolean null, started_at, submitted_at null, graded_at null,
    time_spent_seconds int`. Index `(employee_id, quiz_id)`.
  - `ess_quiz_answers` — `id, company_id, attempt_id, question_id, selected_option_ids
    uuid[] null, text_answer text null, awarded_points numeric null, needs_manual boolean,
    grader_comment text null`.
- RLS on all (direct `company_id` for top tables; answers/options parent-scoped or direct).
  `047`–`054` reserved.

## 4. Work items
- **No-code builder** (Staff/Admin): create/edit/**duplicate**/delete quizzes; add questions
  of every type; manage options + correct answers; set all config options. Fully UI-driven,
  validated with Zod. Duplicate = deep copy (quiz + questions + options).
- **Quiz runtime** (volunteer): launch from a training item; enforce **time limit** (server
  authoritative — store `started_at`, reject/auto-submit past limit); **randomize** question
  order when configured; **attempt limit** enforced server-side.
- **Grading**:
  - Auto-grade objective types on submit (`mc_single`, `mc_multi` (exact set match),
    `true_false`). Short answer: optional exact/normalized match else manual. Essay: manual.
  - Compute score; `passed = score >= passing_score` once all questions graded.
  - **Manual-grade queue** (`/dashboard/grading`, Staff): list attempts with
    `needs_manual` answers; grader assigns points + comment; on completion recompute pass.
  - **Feedback timing**: reveal correctness/explanations per the quiz setting.
- **Module link**: on a graded pass/fail for an attempt tied to `training_item_id`, call
  Phase 5 `recordQuizResult(employeeId, itemId, passed, score)` (contract; stub locally if
  Phase 5 not merged). Write a training event via that path.

## 5. Contracts PUBLISHED
- `ess_quizzes` (the `quiz_id` Phase 5 references), `ess_quiz_questions`, `ess_quiz_options`,
  `ess_quiz_attempts`, `ess_quiz_answers`.
- `GET /api/quizzes`, `GET /api/quiz-attempts?employee_id=&quiz_id=` (scoped) — Phase 7
  reporting reads attempts/scores.

## 6. Contracts CONSUMED (stub if needed)
- Phase 5: `ess_training_items.quiz_id`, `recordQuizResult(employeeId, itemId, passed, score)`.
  If Phase 5 not in your worktree, stub a local `ess_training_items` minimal table + a no-op
  `recordQuizResult` (mark DELETE BEFORE MERGE) so runtime works.
- Phase 0: baseline schema, `recordAudit`. Phase 1: `useLabels`, nav markers, `MODULE_IDS`
  (`quizzes`), `assertModuleEnabled` + dependency (quizzes requires training).

## 7. Tests
- Each question type grades correctly (MC-multi requires exact set; partial ≠ pass unless
  configured). 
- Time limit: submission after `started_at + limit` is rejected/auto-submitted.
- Attempt limit enforced; (limit+1)th launch blocked.
- Essay routes to manual queue; grading it recomputes pass and calls `recordQuizResult`.
- Randomization preserves correct grading. Cross-tenant RLS denial on quizzes/attempts.

## 8. Seed (`scripts/seed-phase-6.ts`)
- An "Induction Knowledge Check" quiz (one of each question type), passing score 70,
  2 attempts, 10-min limit, linked to the Phase 5 induction module's quiz item id.

## 9. Acceptance criteria
- [ ] Staff builds a mixed-type quiz via UI (no code), duplicates it, edits, deletes.
- [ ] Volunteer takes it under a time limit; objective questions auto-grade.
- [ ] An essay answer lands in the manual queue; grading it sets pass/fail.
- [ ] A pass marks the linked training item complete (via Phase 5 contract).
- [ ] RLS + tests pass; `pnpm build` passes.

## 10. MERGE_NOTES
Migrations 045(+); PHASE-6 nav append; confirm `recordQuizResult` signature matches Phase 5;
any stub tables/functions to delete; essay grading scope confirmed for MVP.
