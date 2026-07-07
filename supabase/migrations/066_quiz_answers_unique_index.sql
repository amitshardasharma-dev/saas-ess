-- Migration: 066_quiz_answers_unique_index.sql
-- Fix: quiz submission failed with "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification". gradeAndFinalizeAttempt upserts into
-- ess_quiz_answers ON CONFLICT (attempt_id, question_id), but that unique index
-- (declared in 046) was missing from this database. Recreate it (+ the sibling
-- indexes) idempotently. The table is empty, so no de-dup is needed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ess_quiz_answers
  ON public.ess_quiz_answers (attempt_id, question_id);
CREATE INDEX IF NOT EXISTS idx_ess_quiz_answers_company ON public.ess_quiz_answers (company_id);
CREATE INDEX IF NOT EXISTS idx_ess_quiz_answers_attempt ON public.ess_quiz_answers (attempt_id);
CREATE INDEX IF NOT EXISTS idx_ess_quiz_answers_manual ON public.ess_quiz_answers (company_id, needs_manual);
