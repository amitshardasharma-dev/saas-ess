-- 020_onboarding.sql
-- Phase 2 — Onboarding workflow tables.
-- Owns migrations 020–024. Every table ships RLS + tenant_isolation in this file.
-- Helpers current_company_id() / is_super_admin() are defined in Phase 0.

-- Reusable checklist templates.
create table if not exists ess_onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references ess_companies(id),
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Step definitions. A row belongs to a template (definition) OR to an
-- employee's onboarding instance (employee_id set).
create table if not exists ess_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references ess_companies(id),
  template_id uuid references ess_onboarding_templates(id) on delete cascade,
  employee_id uuid references ess_employees(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'pending', -- pending | done | skipped
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One onboarding state row per employee.
create table if not exists ess_onboarding_states (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references ess_companies(id),
  employee_id uuid not null references ess_employees(id) on delete cascade,
  status text not null default 'not_started', -- not_started | in_progress | blocked | completed
  blocked_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_id)
);

create index if not exists ess_onboarding_steps_employee_idx
  on ess_onboarding_steps (employee_id);
create index if not exists ess_onboarding_steps_template_idx
  on ess_onboarding_steps (template_id);
create index if not exists ess_onboarding_states_employee_idx
  on ess_onboarding_states (employee_id);

-- RLS + tenant_isolation (same migration as table creation).
alter table ess_onboarding_templates enable row level security;
create policy tenant_isolation on ess_onboarding_templates
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

alter table ess_onboarding_steps enable row level security;
create policy tenant_isolation on ess_onboarding_steps
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

alter table ess_onboarding_states enable row level security;
create policy tenant_isolation on ess_onboarding_states
  using (company_id = current_company_id())
  with check (company_id = current_company_id());
