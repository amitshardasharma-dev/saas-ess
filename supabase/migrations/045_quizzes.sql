-- Migration: 045_quizzes.sql
-- Phase: 6 (Quiz & Assessment Engine — quiz definitions)
-- Description: Quiz definitions, questions, and options for the no-code builder.
--   Idempotent and RLS-isolated in the SAME migration (direct company_id variant,
--   matching 037_training_tracking.sql / 006). Migration block 045-054 (Phase 6);
--   047-054 reserved.
--
--   PUBLISHED CONTRACTS (Phase 5/7 reference these):
--     ess_quizzes        — ess_training_items.quiz_id points here.
--     ess_quiz_questions — one row per question (5 types).
--     ess_quiz_options   — MC/TF answer options with is_correct flags.

-- ---------------------------------------------------------------------------
-- ess_quizzes — one row per quiz definition.
-- ---------------------------------------------------------------------------
create table if not exists public.ess_quizzes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  title text not null,
  description text,
  passing_score numeric not null default 70,
  attempt_limit int,
  randomize_questions boolean not null default false,
  time_limit_seconds int,
  feedback_timing text not null default 'after_submit'
    check (feedback_timing in ('immediate', 'after_submit', 'after_close')),
  show_explanations boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.ess_employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ess_quizzes_company on public.ess_quizzes (company_id);
create index if not exists idx_ess_quizzes_status on public.ess_quizzes (company_id, status);

-- ---------------------------------------------------------------------------
-- ess_quiz_questions — one row per question.
-- ---------------------------------------------------------------------------
create table if not exists public.ess_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  quiz_id uuid not null references public.ess_quizzes(id) on delete cascade,
  type text not null
    check (type in ('mc_single', 'mc_multi', 'true_false', 'short_answer', 'essay')),
  prompt text not null,
  points numeric not null default 1,
  explanation text,
  -- For short_answer auto-grading: accepted normalized answers (jsonb array of strings).
  -- Empty/null => the question is routed to manual grading.
  accepted_answers jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ess_quiz_questions_company on public.ess_quiz_questions (company_id);
create index if not exists idx_ess_quiz_questions_quiz on public.ess_quiz_questions (quiz_id, sort_order);

-- ---------------------------------------------------------------------------
-- ess_quiz_options — answer options for MC/TF questions.
-- ---------------------------------------------------------------------------
create table if not exists public.ess_quiz_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  question_id uuid not null references public.ess_quiz_questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ess_quiz_options_company on public.ess_quiz_options (company_id);
create index if not exists idx_ess_quiz_options_question on public.ess_quiz_options (question_id, sort_order);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses public.set_updated_at from 007).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ess_quizzes', 'ess_quiz_questions'] loop
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
    'ess_quizzes',
    'ess_quiz_questions',
    'ess_quiz_options'
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
