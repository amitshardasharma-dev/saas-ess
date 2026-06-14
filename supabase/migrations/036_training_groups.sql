-- Migration: 036_training_groups.sql
-- Phase: 5 (LMS — Groups & Assignment)
-- Description: Custom training groups (with optional criteria), group members,
--   and module assignments (by role / org_unit / group / user). Idempotent and
--   RLS-isolated in the same migration (direct company_id variant from 006).

-- ---------------------------------------------------------------------------
-- ess_training_groups — a named, optionally criteria-driven cohort.
--   criteria examples: {"role":"employee"} or {"org_unit":"Outreach"}.
--   When criteria is null the group is a manual list (ess_training_group_members).
-- ---------------------------------------------------------------------------
create table if not exists public.ess_training_groups (
	id uuid primary key default gen_random_uuid(),
	company_id uuid not null references public.ess_companies(id) on delete cascade,
	name text not null,
	criteria jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_ess_training_groups_company on public.ess_training_groups (company_id);

-- ---------------------------------------------------------------------------
-- ess_training_group_members — explicit membership of a custom group.
-- ---------------------------------------------------------------------------
create table if not exists public.ess_training_group_members (
	id uuid primary key default gen_random_uuid(),
	company_id uuid not null references public.ess_companies(id) on delete cascade,
	group_id uuid not null references public.ess_training_groups(id) on delete cascade,
	employee_id uuid not null references public.ess_employees(id) on delete cascade,
	created_at timestamptz not null default now()
);

create index if not exists idx_ess_training_group_members_company on public.ess_training_group_members (company_id);
create index if not exists idx_ess_training_group_members_group on public.ess_training_group_members (group_id);
create unique index if not exists uq_ess_training_group_members on public.ess_training_group_members (group_id, employee_id);

-- ---------------------------------------------------------------------------
-- ess_training_assignments — assigns a module to a target audience.
--   target_type drives interpretation of target_value:
--     'role'     -> a UserRole value (e.g. 'employee')
--     'org_unit' -> an ess_employees.department value
--     'group'    -> an ess_training_groups.id
--     'user'     -> an ess_employees.id
-- ---------------------------------------------------------------------------
create table if not exists public.ess_training_assignments (
	id uuid primary key default gen_random_uuid(),
	company_id uuid not null references public.ess_companies(id) on delete cascade,
	module_id uuid not null references public.ess_training_modules(id) on delete cascade,
	target_type text not null check (target_type in ('role', 'org_unit', 'group', 'user')),
	target_value text not null,
	assigned_at timestamptz not null default now(),
	due_at timestamptz
);

create index if not exists idx_ess_training_assignments_company on public.ess_training_assignments (company_id);
create index if not exists idx_ess_training_assignments_module on public.ess_training_assignments (module_id);
create unique index if not exists uq_ess_training_assignments on public.ess_training_assignments (module_id, target_type, target_value);

-- ---------------------------------------------------------------------------
-- updated_at trigger for groups (reuses public.set_updated_at from 007).
-- ---------------------------------------------------------------------------
do $$ begin
	drop trigger if exists trg_ess_training_groups_updated on public.ess_training_groups;
	create trigger trg_ess_training_groups_updated before update on public.ess_training_groups
		for each row execute function public.set_updated_at();
end $$;

-- ---------------------------------------------------------------------------
-- RLS — direct company_id tenant isolation (pattern from 006).
-- ---------------------------------------------------------------------------
do $$
declare
	t text;
	tables text[] := array[
		'ess_training_groups',
		'ess_training_group_members',
		'ess_training_assignments'
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
