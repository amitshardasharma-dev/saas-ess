-- 056_reminders.sql — Phase 7 expiry reminders
-- Tables: ess_reminder_configs, ess_reminder_sends. RLS in same migration.

-- === ess_reminder_configs ===================================================
create table if not exists public.ess_reminder_configs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  applies_to text not null default 'certification'
    check (applies_to in ('certification', 'contract', 'custom')),
  -- Days relative to expiry: positive = before, 0 = on expiry, negative = overdue.
  offsets int[] not null default '{90,30,7,0,-7}',
  frequency text not null default 'once'
    check (frequency in ('once', 'weekly', 'daily_overdue')),
  email_subject text not null default '',
  email_body_html text not null default '',
  escalate_to text not null default 'none'
    check (escalate_to in ('supervisor', 'admin', 'none')),
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_ess_reminder_configs_company on public.ess_reminder_configs(company_id);
create index if not exists idx_ess_reminder_configs_active on public.ess_reminder_configs(company_id, is_active);

alter table public.ess_reminder_configs enable row level security;
alter table public.ess_reminder_configs force row level security;
drop policy if exists tenant_isolation on public.ess_reminder_configs;
create policy tenant_isolation on public.ess_reminder_configs
  for all to authenticated
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

-- === ess_reminder_sends (dedupe log) ========================================
create table if not exists public.ess_reminder_sends (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  reminder_config_id uuid not null references public.ess_reminder_configs(id) on delete cascade,
  certification_id uuid,
  employee_id uuid not null references public.ess_employees(id) on delete cascade,
  offset_sent int not null,
  sent_at timestamptz default now(),
  -- A given (config, cert, offset) must email at most once — the dedupe guard.
  unique (reminder_config_id, certification_id, offset_sent)
);

create index if not exists idx_ess_reminder_sends_company on public.ess_reminder_sends(company_id);
create index if not exists idx_ess_reminder_sends_cert on public.ess_reminder_sends(certification_id);

alter table public.ess_reminder_sends enable row level security;
alter table public.ess_reminder_sends force row level security;
drop policy if exists tenant_isolation on public.ess_reminder_sends;
create policy tenant_isolation on public.ess_reminder_sends
  for all to authenticated
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
