-- Migration: 035_training_content.sql
-- Phase: 5 (LMS — Training Content Management)
-- Description: Training modules + ordered items (video / document / quiz).
--   Idempotent (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS). Ships its
--   RLS tenant-isolation policy in the SAME migration (conventions §3/§6.3),
--   using the direct-company_id variant from 006_rls_tenant_isolation.sql.
--
-- NOTE (cross-phase): ess_training_items.quiz_id references Phase 6's
--   ess_quizzes by VALUE only — it is a plain uuid column with NO foreign key,
--   on purpose, so Phase 5 has no hard build/runtime dependency on Phase 6.
--   Phase 6 joins on this column. See MERGE_NOTES.md.

-- ---------------------------------------------------------------------------
-- ess_training_modules — a named, publishable container of ordered items.
-- ---------------------------------------------------------------------------
create table if not exists public.ess_training_modules (
	id uuid primary key default gen_random_uuid(),
	company_id uuid not null references public.ess_companies(id) on delete cascade,
	title text not null,
	description text,
	status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
	created_by uuid references public.ess_employees(id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_ess_training_modules_company on public.ess_training_modules (company_id);
create index if not exists idx_ess_training_modules_status on public.ess_training_modules (company_id, status);

-- ---------------------------------------------------------------------------
-- ess_training_items — ordered items within a module.
--   type drives which target column is used:
--     'video'    -> video_url + video_provider
--     'document' -> document_id (references existing ess_documents by value)
--     'quiz'     -> quiz_id (Phase 6 ess_quizzes id; FK-LESS by design)
-- ---------------------------------------------------------------------------
create table if not exists public.ess_training_items (
	id uuid primary key default gen_random_uuid(),
	company_id uuid not null references public.ess_companies(id) on delete cascade,
	module_id uuid not null references public.ess_training_modules(id) on delete cascade,
	type text not null check (type in ('video', 'document', 'quiz')),
	title text not null,
	video_url text,
	video_provider text,
	document_id uuid,
	quiz_id uuid, -- Phase 6 ess_quizzes.id — intentionally NO foreign key
	required boolean not null default true,
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_ess_training_items_company on public.ess_training_items (company_id);
create index if not exists idx_ess_training_items_module on public.ess_training_items (module_id, sort_order);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses public.set_updated_at from 007).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
	foreach t in array array['ess_training_modules', 'ess_training_items'] loop
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
	tables text[] := array['ess_training_modules', 'ess_training_items'];
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
