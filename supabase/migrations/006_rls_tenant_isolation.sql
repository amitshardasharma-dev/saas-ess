-- ============================================================================
-- Migration 006: Row-Level Security (RLS) tenant isolation — DEFENSE IN DEPTH
-- ----------------------------------------------------------------------------
-- Status:  REVIEW BEFORE APPLYING
-- Purpose: The application currently enforces tenant isolation ONLY in app code
--          (each query manually adds `.eq('company_id', ...)`). This migration
--          adds a second, database-level guarantee so a forgotten filter in a
--          route can no longer leak or destroy another tenant's data.
--
-- IMPORTANT — read this before applying:
--   * Every API route currently uses the Supabase SERVICE ROLE client
--     (`supabaseAdmin`). The service role has the BYPASSRLS attribute, so these
--     policies DO NOT affect existing routes — the app keeps working unchanged.
--   * Because of that, this migration on its own does NOT fix the application-
--     layer IDOR bugs listed in docs/security/2026-05-31-tenant-isolation-audit.md.
--     Those must be fixed in the route handlers (or by moving tenant reads onto a
--     user-scoped client). RLS is the safety net; the route fixes are the cure.
--   * These policies protect against any access that goes through the ANON or
--     AUTHENTICATED keys (e.g. the browser client, future direct-from-client
--     queries, a leaked anon key). That is meaningful hardening on its own.
--
-- Safe to apply: yes. It does not drop data and does not change service-role
-- behaviour. To roll back, see the DROP POLICY block at the bottom (commented).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper functions
-- ----------------------------------------------------------------------------

-- Returns the company_id of the currently authenticated user, or NULL.
-- SECURITY DEFINER so it can read ess_app_users regardless of the caller's RLS.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.ess_app_users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

-- Returns true if the current user is a platform-level super admin.
-- Adjust the predicate to match how you flag super admins (role text shown here).
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ess_app_users
    where auth_user_id = auth.uid()
      and is_active = true
      and role = 'super_admin'
  )
$$;

revoke all on function public.current_company_id() from public;
revoke all on function public.is_super_admin() from public;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Tables that carry a DIRECT company_id column
--    Policy: rows are visible/writable only when company_id matches the caller's
--    company (super admins see everything).
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  direct_tables text[] := array[
    'ess_employees',
    'ess_app_users',
    'ess_projects',
    'ess_timesheet_configs',
    'ess_timesheets',
    'ess_documents',
    'ess_document_categories',
    'ess_contracts',
    'ess_contract_types',
    'ess_appraisal_templates',
    'ess_appraisal_cycles',
    'ess_appraisals',
    'ess_goals',
    'ess_announcements',
    'ess_leave_types',
    'ess_leave_applications',
    'ess_leave_allocations',
    'ess_expense_categories',
    'ess_expense_claims'
  ];
begin
  foreach t in array direct_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping % (does not exist)', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('drop policy if exists tenant_isolation on public.%I;', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        for all
        to authenticated
        using (company_id = public.current_company_id() or public.is_super_admin())
        with check (company_id = public.current_company_id() or public.is_super_admin());
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. CHILD tables (no direct company_id) — scoped through their parent row.
--    Policy: the parent row must belong to the caller's company.
-- ----------------------------------------------------------------------------

-- helper macro pattern repeated explicitly for clarity / auditability.

-- timesheet entries -> ess_timesheets
do $$ begin
  if to_regclass('public.ess_timesheet_entries') is not null then
    alter table public.ess_timesheet_entries enable row level security;
    alter table public.ess_timesheet_entries force row level security;
    drop policy if exists tenant_isolation on public.ess_timesheet_entries;
    create policy tenant_isolation on public.ess_timesheet_entries
      for all to authenticated
      using (exists (select 1 from public.ess_timesheets p
                     where p.id = timesheet_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_timesheets p
                          where p.id = timesheet_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- timesheet approval entries -> ess_timesheets
do $$ begin
  if to_regclass('public.ess_timesheet_approval_entries') is not null then
    alter table public.ess_timesheet_approval_entries enable row level security;
    alter table public.ess_timesheet_approval_entries force row level security;
    drop policy if exists tenant_isolation on public.ess_timesheet_approval_entries;
    create policy tenant_isolation on public.ess_timesheet_approval_entries
      for all to authenticated
      using (exists (select 1 from public.ess_timesheets p
                     where p.id = timesheet_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_timesheets p
                          where p.id = timesheet_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- document versions -> ess_documents
do $$ begin
  if to_regclass('public.ess_document_versions') is not null then
    alter table public.ess_document_versions enable row level security;
    alter table public.ess_document_versions force row level security;
    drop policy if exists tenant_isolation on public.ess_document_versions;
    create policy tenant_isolation on public.ess_document_versions
      for all to authenticated
      using (exists (select 1 from public.ess_documents p
                     where p.id = document_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_documents p
                          where p.id = document_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- document acknowledgments -> ess_documents
do $$ begin
  if to_regclass('public.ess_document_acknowledgments') is not null then
    alter table public.ess_document_acknowledgments enable row level security;
    alter table public.ess_document_acknowledgments force row level security;
    drop policy if exists tenant_isolation on public.ess_document_acknowledgments;
    create policy tenant_isolation on public.ess_document_acknowledgments
      for all to authenticated
      using (exists (select 1 from public.ess_documents p
                     where p.id = document_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_documents p
                          where p.id = document_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- document read tracking -> ess_documents
do $$ begin
  if to_regclass('public.ess_document_read_tracking') is not null then
    alter table public.ess_document_read_tracking enable row level security;
    alter table public.ess_document_read_tracking force row level security;
    drop policy if exists tenant_isolation on public.ess_document_read_tracking;
    create policy tenant_isolation on public.ess_document_read_tracking
      for all to authenticated
      using (exists (select 1 from public.ess_documents p
                     where p.id = document_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_documents p
                          where p.id = document_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- contract history -> ess_contracts
do $$ begin
  if to_regclass('public.ess_contract_history') is not null then
    alter table public.ess_contract_history enable row level security;
    alter table public.ess_contract_history force row level security;
    drop policy if exists tenant_isolation on public.ess_contract_history;
    create policy tenant_isolation on public.ess_contract_history
      for all to authenticated
      using (exists (select 1 from public.ess_contracts p
                     where p.id = contract_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_contracts p
                          where p.id = contract_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- appraisal responses -> ess_appraisals
do $$ begin
  if to_regclass('public.ess_appraisal_responses') is not null then
    alter table public.ess_appraisal_responses enable row level security;
    alter table public.ess_appraisal_responses force row level security;
    drop policy if exists tenant_isolation on public.ess_appraisal_responses;
    create policy tenant_isolation on public.ess_appraisal_responses
      for all to authenticated
      using (exists (select 1 from public.ess_appraisals p
                     where p.id = appraisal_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_appraisals p
                          where p.id = appraisal_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- expense items -> ess_expense_claims
-- (live table is `ess_expense_items`, not `ess_expense_claim_items`; it carries both
--  expense_claim_id and a direct company_id — parent-scoped policy below is sufficient.)
do $$ begin
  if to_regclass('public.ess_expense_items') is not null then
    alter table public.ess_expense_items enable row level security;
    alter table public.ess_expense_items force row level security;
    drop policy if exists tenant_isolation on public.ess_expense_items;
    create policy tenant_isolation on public.ess_expense_items
      for all to authenticated
      using (exists (select 1 from public.ess_expense_claims p
                     where p.id = expense_claim_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_expense_claims p
                          where p.id = expense_claim_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- expense approval entries -> ess_expense_claims
do $$ begin
  if to_regclass('public.ess_expense_approval_entries') is not null then
    alter table public.ess_expense_approval_entries enable row level security;
    alter table public.ess_expense_approval_entries force row level security;
    drop policy if exists tenant_isolation on public.ess_expense_approval_entries;
    create policy tenant_isolation on public.ess_expense_approval_entries
      for all to authenticated
      using (exists (select 1 from public.ess_expense_claims p
                     where p.id = expense_claim_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_expense_claims p
                          where p.id = expense_claim_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- leave approval entries -> ess_leave_applications
do $$ begin
  if to_regclass('public.ess_leave_approval_entries') is not null then
    alter table public.ess_leave_approval_entries enable row level security;
    alter table public.ess_leave_approval_entries force row level security;
    drop policy if exists tenant_isolation on public.ess_leave_approval_entries;
    create policy tenant_isolation on public.ess_leave_approval_entries
      for all to authenticated
      using (exists (select 1 from public.ess_leave_applications p
                     where p.id = leave_application_id
                       and (p.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_leave_applications p
                          where p.id = leave_application_id
                            and (p.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- NOTE: there is no `ess_leave_application_days` table in this schema (leave-day
-- breakdown is not stored as a separate child table). The previously-present block
-- targeting it was a code-derived guess and has been removed.

-- announcement dismissals -> per-user (scoped by the dismissing user's company via app_user)
do $$ begin
  if to_regclass('public.ess_announcement_dismissals') is not null then
    alter table public.ess_announcement_dismissals enable row level security;
    alter table public.ess_announcement_dismissals force row level security;
    drop policy if exists tenant_isolation on public.ess_announcement_dismissals;
    create policy tenant_isolation on public.ess_announcement_dismissals
      for all to authenticated
      using (exists (select 1 from public.ess_app_users u
                     where u.id = app_user_id
                       and (u.company_id = public.current_company_id() or public.is_super_admin())))
      with check (exists (select 1 from public.ess_app_users u
                          where u.id = app_user_id
                            and (u.company_id = public.current_company_id() or public.is_super_admin())));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Platform-only tables — readable by any authenticated user is fine for
--    plans (pricing), but writes restricted to super admins.
-- ----------------------------------------------------------------------------
do $$ begin
  if to_regclass('public.ess_platform_plans') is not null then
    alter table public.ess_platform_plans enable row level security;
    drop policy if exists plans_read on public.ess_platform_plans;
    drop policy if exists plans_write on public.ess_platform_plans;
    create policy plans_read  on public.ess_platform_plans for select to authenticated using (true);
    create policy plans_write on public.ess_platform_plans for all    to authenticated
      using (public.is_super_admin()) with check (public.is_super_admin());
  end if;
end $$;

-- ess_companies: a user may read their own company; super admins manage all.
do $$ begin
  if to_regclass('public.ess_companies') is not null then
    alter table public.ess_companies enable row level security;
    drop policy if exists company_self on public.ess_companies;
    create policy company_self on public.ess_companies
      for all to authenticated
      using (id = public.current_company_id() or public.is_super_admin())
      with check (id = public.current_company_id() or public.is_super_admin());
  end if;
end $$;

-- ============================================================================
-- ROLLBACK (uncomment to revert)
-- ----------------------------------------------------------------------------
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'ess_employees','ess_app_users','ess_projects','ess_timesheet_configs','ess_timesheets',
--     'ess_documents','ess_document_categories','ess_contracts','ess_contract_types',
--     'ess_appraisal_templates','ess_appraisal_cycles','ess_appraisals','ess_goals',
--     'ess_announcements','ess_leave_types','ess_leave_applications','ess_leave_allocations',
--     'ess_expense_categories','ess_expense_claims','ess_timesheet_entries',
--     'ess_timesheet_approval_entries','ess_document_versions','ess_document_acknowledgments',
--     'ess_document_read_tracking','ess_contract_history','ess_appraisal_responses',
--     'ess_expense_items','ess_expense_approval_entries','ess_leave_approval_entries',
--     'ess_announcement_dismissals','ess_companies'
--   ] loop
--     if to_regclass('public.'||t) is not null then
--       execute format('alter table public.%I disable row level security;', t);
--       execute format('drop policy if exists tenant_isolation on public.%I;', t);
--     end if;
--   end loop;
-- end $$;
-- drop function if exists public.current_company_id();
-- drop function if exists public.is_super_admin();
-- ============================================================================
