-- Down migration for 066 (leaves 046's original declarations intact conceptually).
DROP INDEX IF EXISTS uq_ess_quiz_answers;
DROP INDEX IF EXISTS idx_ess_quiz_answers_company;
DROP INDEX IF EXISTS idx_ess_quiz_answers_attempt;
DROP INDEX IF EXISTS idx_ess_quiz_answers_manual;
