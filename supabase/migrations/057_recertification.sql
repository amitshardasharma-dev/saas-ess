-- 057_recertification.sql — Phase 7 recertification workflow
-- Tables: ess_recertifications, ess_recert_history (parent-scoped child). RLS here.

-- === ess_recertifications ===================================================
create table if not exists public.ess_recertifications (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  employee_id uuid not null references public.ess_employees(id) on delete cascade,
  certification_id uuid not null,
  triggered_at timestamptz not null default now(),
  assigned_module_id uuid,
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz default now(),
  -- One open recert per cert at a time (idempotent recert.scan).
  unique (certification_id)
);

create index if not exists idx_ess_recertifications_company on public.ess_recertifications(company_id);
create index if not exists idx_ess_recertifications_employee on public.ess_recertifications(employee_id);
create index if not exists idx_ess_recertifications_status on public.ess_recertifications(company_id, status);

alter table public.ess_recertifications enable row level security;
alter table public.ess_recertifications force row level security;
drop policy if exists tenant_isolation on public.ess_recertifications;
create policy tenant_isolation on public.ess_recertifications
  for all to authenticated
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

-- === ess_recert_history (child of ess_recertifications) =====================
create table if not exists public.ess_recert_history (
  id uuid default gen_random_uuid() primary key,
  recertification_id uuid not null references public.ess_recertifications(id) on delete cascade,
  event text not null,
  detail text,
  created_at timestamptz default now()
);

create index if not exists idx_ess_recert_history_parent on public.ess_recert_history(recertification_id);

alter table public.ess_recert_history enable row level security;
alter table public.ess_recert_history force row level security;
drop policy if exists tenant_isolation on public.ess_recert_history;
create policy tenant_isolation on public.ess_recert_history
  for all to authenticated
  using (
    exists (
      select 1 from public.ess_recertifications r
      where r.id = ess_recert_history.recertification_id
        and (r.company_id = public.current_company_id() or public.is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.ess_recertifications r
      where r.id = ess_recert_history.recertification_id
        and (r.company_id = public.current_company_id() or public.is_super_admin())
    )
  );
