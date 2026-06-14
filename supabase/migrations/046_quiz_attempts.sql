-- Migration: 046_quiz_attempts.sql
-- Phase: 6 (Quiz & Assessment Engine — attempts & answers)
-- Description: Volunteer quiz attempts and their per-question answers. Server is
--   authoritative for time + attempt limits (started_at / attempt_no). Idempotent
--   and RLS-isolated in the SAME migration (direct company_id variant). 047-054
--   reserved.
--
--   PUBLISHED CONTRACTS (Phase 7 reporting reads these):
--     ess_quiz_attempts — score/passed per attempt, optional training_item_id link.
--     ess_quiz_answers  — per-question answers + manual-grade queue flags.

-- ---------------------------------------------------------------------------
-- ess_quiz_attempts — one row per volunteer attempt at a quiz.
-- ---------------------------------------------------------------------------
create table if not exists public.ess_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  quiz_id uuid not null references public.ess_quizzes(id) on delete cascade,
  employee_id uuid not null references public.ess_employees(id) on delete cascade,
  -- Optional link to the launching training item (Phase 5 contract). Nullable so a
  -- quiz can be taken standalone. No FK to ess_training_items so Phase 6 stays
  -- independently applicable; integrity is enforced at the app layer.
  training_item_id uuid,
  attempt_no int not null default 1,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'graded')),
  score numeric,
  passed boolean,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  time_spent_seconds int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ess_quiz_attempts_company on public.ess_quiz_attempts (company_id);
create index if not exists idx_ess_quiz_attempts_employee_quiz on public.ess_quiz_attempts (employee_id, quiz_id);
create index if not exists idx_ess_quiz_attempts_status on public.ess_quiz_attempts (company_id, status);
create unique index if not exists uq_ess_quiz_attempts_no
  on public.ess_quiz_attempts (employee_id, quiz_id, attempt_no);

-- ---------------------------------------------------------------------------
-- ess_quiz_answers — one row per (attempt, question).
-- ---------------------------------------------------------------------------
create table if not exists public.ess_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  attempt_id uuid not null references public.ess_quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.ess_quiz_questions(id) on delete cascade,
  selected_option_ids uuid[],
  text_answer text,
  awarded_points numeric,
  needs_manual boolean not null default false,
  grader_comment text,
  graded_by uuid references public.ess_employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ess_quiz_answers_company on public.ess_quiz_answers (company_id);
create index if not exists idx_ess_quiz_answers_attempt on public.ess_quiz_answers (attempt_id);
create index if not exists idx_ess_quiz_answers_manual on public.ess_quiz_answers (company_id, needs_manual);
create unique index if not exists uq_ess_quiz_answers
  on public.ess_quiz_answers (attempt_id, question_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses public.set_updated_at from 007).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ess_quiz_attempts', 'ess_quiz_answers'] loop
    execute format('drop trigger if exists trg_%I_updated on public.%I;', t, t);
    execute format('create trigger trg_%I_updated before update on public.%I for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS — direct company_id tenant isolation (pattern from 037 / 006).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'ess_quiz_attempts',
    'ess_quiz_answers'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('drop policy if exists tenant_isolation on public.%I;', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        for all to authenticated
        using (company_id = public.current_company_id() or public.is_super_admin())
        with check (company_id = public.current_company_id() or public.is_super_admin());
    $f$, t);
  end loop;
end $$;
