-- Migration: 037_training_tracking.sql
-- Phase: 5 (LMS — Automated Tracking)
-- Description: Per-employee module progress, per-item progress, and an
--   append-only event history. Idempotent and RLS-isolated in the same
--   migration (direct company_id variant from 006). Reserved: 038–044.

-- ---------------------------------------------------------------------------
-- ess_training_progress — one row per (employee, module).
-- ---------------------------------------------------------------------------
create table if not exists public.ess_training_progress (
	id uuid primary key default gen_random_uuid(),
	company_id uuid not null references public.ess_companies(id) on delete cascade,
	employee_id uuid not null references public.ess_employees(id) on delete cascade,
	module_id uuid not null references public.ess_training_modules(id) on delete cascade,
	percent_complete numeric not null default 0,
	status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete')),
	started_at timestamptz,
	completed_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_ess_training_progress_company on public.ess_training_progress (company_id);
create index if not exists idx_ess_training_progress_employee on public.ess_training_progress (employee_id);
create index if not exists idx_ess_training_progress_module on public.ess_training_progress (module_id);
create unique index if not exists uq_ess_training_progress on public.ess_training_progress (employee_id, module_id);

-- ---------------------------------------------------------------------------
-- ess_training_item_progress — one row per (employee, item).
-- ---------------------------------------------------------------------------
create table if not exists public.ess_training_item_progress (
	id uuid primary key default gen_random_uuid(),
	company_id uuid not null references public.ess_companies(id) on delete cascade,
	employee_id uuid not null references public.ess_employees(id) on delete cascade,
	item_id uuid not null references public.ess_training_items(id) on delete cascade,
	status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete')),
	acknowledged boolean not null default false,
	time_spent_seconds int not null default 0,
	last_event_at timestamptz,
	completed_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_ess_training_item_progress_company on public.ess_training_item_progress (company_id);
create index if not exists idx_ess_training_item_progress_employee on public.ess_training_item_progress (employee_id);
create index if not exists idx_ess_training_item_progress_item on public.ess_training_item_progress (item_id);
create unique index if not exists uq_ess_training_item_progress on public.ess_training_item_progress (employee_id, item_id);

-- ---------------------------------------------------------------------------
-- ess_training_events — append-only history (feeds Phase 7 reporting).
-- ---------------------------------------------------------------------------
create table if not exists public.ess_training_events (
	id uuid primary key default gen_random_uuid(),
	company_id uuid not null references public.ess_companies(id) on delete cascade,
	employee_id uuid not null references public.ess_employees(id) on delete cascade,
	item_id uuid references public.ess_training_items(id) on delete set null,
	module_id uuid not null references public.ess_training_modules(id) on delete cascade,
	event text not null,
	meta jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists idx_ess_training_events_company on public.ess_training_events (company_id);
create index if not exists idx_ess_training_events_employee on public.ess_training_events (employee_id, created_at desc);
create index if not exists idx_ess_training_events_module on public.ess_training_events (module_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses public.set_updated_at from 007).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
	foreach t in array array['ess_training_progress', 'ess_training_item_progress'] loop
		execute format('drop trigger if exists trg_%I_updated on public.%I;', t, t);
		execute format('create trigger trg_%I_updated before update on public.%I for each row execute function public.set_updated_at();', t, t);
	end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS — direct company_id tenant isolation (pattern from 006).
-- ---------------------------------------------------------------------------
do $$
declare
	t text;
	tables text[] := array[
		'ess_training_progress',
		'ess_training_item_progress',
		'ess_training_events'
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
