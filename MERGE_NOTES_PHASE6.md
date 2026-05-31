# Phase 6 — Quiz & Assessment Engine + No-Code Builder — MERGE NOTES

Branch: `feature/phase-6-quizzes` (worktree `/Volumes/ssd2/projects/ess-phase-6`).

## Migrations (block 045–054; 047–054 reserved)
- `supabase/migrations/045_quizzes.sql` — `ess_quizzes`, `ess_quiz_questions`,
  `ess_quiz_options`. RLS (tenant_isolation via `current_company_id()` /
  `is_super_admin()`) + `updated_at` triggers in the SAME migration. Pattern copied
  from `037_training_tracking.sql`.
  - Added one extra column not literally in the spec: `ess_quiz_questions.accepted_answers jsonb`
    (default `[]`). Used to auto-grade `short_answer` by normalized match; empty => manual.
- `supabase/migrations/046_quiz_attempts.sql` — `ess_quiz_attempts`, `ess_quiz_answers`.
  RLS + triggers in-migration. `ess_quiz_attempts(employee_id, quiz_id)` index +
  unique `(employee_id, quiz_id, attempt_no)`. `ess_quiz_answers` unique `(attempt_id, question_id)`.
  - `ess_quiz_attempts.training_item_id` is intentionally **FK-less** (nullable uuid) so
    Phase 6 applies independently of Phase 5's `ess_training_items`. Integrity is enforced
    at the app layer; `recordQuizResult` looks the item up by id.
  - Added `ess_quiz_answers.graded_by` (employee id, nullable) for the manual-grade audit trail.

## Nav
- New file: `src/config/nav/phase-6-quizzes.nav.tsx` exporting **`quizzesNav: NavSection[]`**
  (two sections: `quizzes` order 56, `grading` order 57; both `moduleId: 'quizzes'`, `minRole: 'hr'`).
- `src/config/navigation.ts`: added ONE import under `// === PHASE-6 NAV ===`
  (`import { quizzesNav } from './nav/phase-6-quizzes.nav'`) and ONE spread under
  `// PHASE-6 ENTRIES` (`...quizzesNav,`). No other lines touched.

## Contracts PUBLISHED
- Tables: `ess_quizzes` (the `quiz_id` Phase 5's `ess_training_items.quiz_id` references),
  `ess_quiz_questions`, `ess_quiz_options`, `ess_quiz_attempts`, `ess_quiz_answers`.
- `GET /api/quizzes` (any authed user; tenant-scoped) and
  `GET /api/quiz-attempts?employee_id=&quiz_id=` (volunteers see own; Staff any) — for Phase 7 reporting.
- Types: `src/types/quiz.ts`. Pure helpers: `src/lib/quiz/{grading,timing,randomize,schemas,index}.ts`.
  Server I/O shell: `src/lib/quiz/server.ts` (server-only — imports supabaseAdmin).
- Client service: `src/services/quiz.ts`.

## Contracts CONSUMED (Phase 5)
- `recordQuizResult(employeeId, itemId, passed, score)` from `@/lib/training` — signature
  matches the FROZEN one in `src/lib/training/tracking.ts`. Called from
  `recomputeAttemptResult()` in `src/lib/quiz/server.ts` exactly once, on the first
  transition of an attempt into `status='graded'`, and only when `training_item_id` is set.
  This covers both auto-graded submit (objective-only quizzes) and the manual-grade path
  (essay/short-answer -> grading queue -> recompute), satisfying the
  "essay -> manual -> recompute -> recordQuizResult" acceptance criterion.
- No stub tables/functions were needed — Phase 5 is merged into this base, so
  `recordQuizResult` and `ess_training_items.quiz_id` already exist. **Nothing to DELETE BEFORE MERGE.**

## API routes (all `withAuth`, module-gated on `quizzes`)
- `POST/GET /api/quizzes` (POST hr+), `GET/PUT/DELETE /api/quizzes/[id]` (mutations hr+),
  `POST /api/quizzes/[id]/duplicate` (hr+, deep copy).
- `GET/POST /api/quiz-attempts` (start attempt: server-authoritative attempt-limit;
  sets `started_at`), `POST /api/quiz-attempts/[id]/submit` (auto-grade + finalize;
  server-authoritative time via `isExpired`/`elapsedSeconds`; ownership-checked).
- `GET /api/grading` (hr+ queue), `GET/POST /api/grading/[id]` (hr+ manual grade -> recompute).
- Cross-tenant ids return 404 (load is always `.eq('company_id', companyId)`).

## UI
- `src/app/dashboard/quizzes/` (list + new + [id] edit), `src/components/quizzes/`
  (`QuizBuilder`, `QuestionEditor`, `QuizPlayer`).
- `src/app/dashboard/training/quiz/[id]/page.tsx` — runtime launched from a training item
  (`?item=<training_item_id>` carries the Phase 5 link).
- `src/app/dashboard/grading/` (queue + [id] grade view).

## Grading model
- `mc_single`/`true_false`: full points iff the single selection is the one correct option.
- `mc_multi`: full points iff selected set EXACTLY equals correct set (no partial credit).
- `short_answer`: auto-grade vs `accepted_answers` (trim/lowercase/collapse-spaces) if any;
  else manual.
- `essay`: always manual.
- `passed = scorePercent >= passing_score`, computed only once all answers are graded.

## Seed
- `scripts/seed-phase-6.ts` (idempotent; **NOT run**) — "Induction Knowledge Check",
  one question of every type, pass 70, 2 attempts, 600s limit, published.

## Deps
- No new package dependencies. Uses existing `zod`, `react-hook-form` not required,
  `lucide-react`, `react-hot-toast`, `@supabase/*`.

## Tests
- `src/lib/quiz/grading.test.ts`, `timing.test.ts`, `randomize.test.ts` — pure unit tests
  (no Supabase/fetch imports) covering: each question type grades correctly; mc_multi exact
  set / no partial credit; short_answer auto vs manual; essay -> manual; score + pass/fail;
  time-limit expiry with grace; attempt-limit (limit+1 blocked); randomization is a stable
  permutation that does NOT change grading.

## Verification status (HONEST)
- All files written successfully via the editor.
- `npx tsc --noEmit` was attempted but the sandbox's Bash stdout was being suppressed for
  the latter part of the session, so I could not capture a confirmed exit code from inside
  the run. Code was written against the exact contracts read from the base (auth-middleware
  ctx shape, `recordQuizResult` signature, NavSection shape, supabase-server `supabaseAdmin`,
  auth-store `token`). The known mismatch (an early draft of `services/quiz.ts` importing a
  non-existent `supabase` singleton from `supabase-client`) was FIXED to use
  `useAuthStore.getState().token`, matching `services/training.ts`. **Re-run
  `npx tsc --noEmit --pretty false` before merge to confirm 0 new errors.**
- Jest: pure tests written; not executed in-session (env flakiness per instructions).

## Cleanup before commit
- Probe/scratch files (`.tsc_*.txt`, `.write_probe.txt`, `.phase6_probe.txt`) must NOT be
  committed; ensure `git status` is clean of them and that `node_modules` is not staged.
