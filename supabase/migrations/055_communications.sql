-- 055_communications.sql — Phase 7 internal communications
-- Tables: ess_messages, ess_message_targets, ess_message_recipients,
-- ess_message_templates. RLS shipped in this same migration (conventions §3, §6.3).

-- === ess_messages ===========================================================
create table if not exists public.ess_messages (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  subject text not null,
  body_html text not null default '',
  sender_app_user_id uuid references public.ess_app_users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_ess_messages_company on public.ess_messages(company_id);
create index if not exists idx_ess_messages_status on public.ess_messages(company_id, status);

alter table public.ess_messages enable row level security;
alter table public.ess_messages force row level security;
drop policy if exists tenant_isolation on public.ess_messages;
create policy tenant_isolation on public.ess_messages
  for all to authenticated
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

-- === ess_message_targets (child of ess_messages) ============================
create table if not exists public.ess_message_targets (
  id uuid default gen_random_uuid() primary key,
  message_id uuid not null references public.ess_messages(id) on delete cascade,
  target_type text not null check (target_type in ('role', 'org_unit', 'group', 'user', 'all')),
  target_value text,
  created_at timestamptz default now()
);

create index if not exists idx_ess_message_targets_message on public.ess_message_targets(message_id);

alter table public.ess_message_targets enable row level security;
alter table public.ess_message_targets force row level security;
drop policy if exists tenant_isolation on public.ess_message_targets;
create policy tenant_isolation on public.ess_message_targets
  for all to authenticated
  using (
    exists (
      select 1 from public.ess_messages m
      where m.id = ess_message_targets.message_id
        and (m.company_id = public.current_company_id() or public.is_super_admin())
    )
  )
  with check (
    exists (
      select 1 from public.ess_messages m
      where m.id = ess_message_targets.message_id
        and (m.company_id = public.current_company_id() or public.is_super_admin())
    )
  );

-- === ess_message_recipients =================================================
create table if not exists public.ess_message_recipients (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  message_id uuid not null references public.ess_messages(id) on delete cascade,
  employee_id uuid not null references public.ess_employees(id) on delete cascade,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz default now(),
  unique (message_id, employee_id)
);

create index if not exists idx_ess_message_recipients_company on public.ess_message_recipients(company_id);
create index if not exists idx_ess_message_recipients_employee on public.ess_message_recipients(employee_id);
create index if not exists idx_ess_message_recipients_message on public.ess_message_recipients(message_id);

alter table public.ess_message_recipients enable row level security;
alter table public.ess_message_recipients force row level security;
drop policy if exists tenant_isolation on public.ess_message_recipients;
create policy tenant_isolation on public.ess_message_recipients
  for all to authenticated
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());

-- === ess_message_templates ==================================================
create table if not exists public.ess_message_templates (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.ess_companies(id) on delete cascade,
  name text not null,
  subject text not null default '',
  body_html text not null default '',
  created_at timestamptz default now()
);

create index if not exists idx_ess_message_templates_company on public.ess_message_templates(company_id);

alter table public.ess_message_templates enable row level security;
alter table public.ess_message_templates force row level security;
drop policy if exists tenant_isolation on public.ess_message_templates;
create policy tenant_isolation on public.ess_message_templates
  for all to authenticated
  using (company_id = public.current_company_id() or public.is_super_admin())
  with check (company_id = public.current_company_id() or public.is_super_admin());
