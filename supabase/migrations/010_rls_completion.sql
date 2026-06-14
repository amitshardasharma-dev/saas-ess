-- Migration: 010_rls_completion.sql
-- Phase: 0
-- Description: Idempotently (re)assert RLS + tenant-isolation policies on every
--   core table. This is the convergence point that resolves the 006/007 ordering
--   problem (see MERGE_NOTES.md, "006/007 decision").
--
--   Why this exists: migration 006 enables RLS / creates policies referencing
--   tables that were never created by a migration (ess_app_users,
--   ess_leave_balances, ess_approval_rules). On a fresh `supabase db reset` those
--   tables do not exist when 006 runs (006 < 007), so 006 fails. We cannot edit
--   006 (it is owned by pre-0 and already merged/applied to live).
--
--   Resolution (option (b), adapted): 007 creates the missing tables. This
--   migration then re-creates EVERY core tenant-isolation policy using
--   DROP POLICY IF EXISTS + CREATE so the end state is identical regardless of
--   whether 006 succeeded, partially succeeded, or was skipped. All tables here
--   exist by the time 010 runs (001-005 + 007), so this migration always
--   succeeds on a fresh reset. Recommended fresh-DB path: let 006 fail/skip; 010
--   establishes the complete, correct policy set.

-- Enable RLS (no-op if already enabled).
ALTER TABLE ess_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_expense_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_contracts ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: a row is visible only to members of its company.
-- ess_companies keys on id; every other table keys on company_id.

DROP POLICY IF EXISTS tenant_isolation_companies ON ess_companies;
CREATE POLICY tenant_isolation_companies ON ess_companies
	USING (id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_app_users ON ess_app_users;
CREATE POLICY tenant_isolation_app_users ON ess_app_users
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_employees ON ess_employees;
CREATE POLICY tenant_isolation_employees ON ess_employees
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_leave_requests ON ess_leave_requests;
CREATE POLICY tenant_isolation_leave_requests ON ess_leave_requests
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_leave_balances ON ess_leave_balances;
CREATE POLICY tenant_isolation_leave_balances ON ess_leave_balances
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_leave_types ON ess_leave_types;
CREATE POLICY tenant_isolation_leave_types ON ess_leave_types
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_expense_reports ON ess_expense_reports;
CREATE POLICY tenant_isolation_expense_reports ON ess_expense_reports
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_expense_items ON ess_expense_items;
CREATE POLICY tenant_isolation_expense_items ON ess_expense_items
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_approval_rules ON ess_approval_rules;
CREATE POLICY tenant_isolation_approval_rules ON ess_approval_rules
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_contracts ON ess_contracts;
CREATE POLICY tenant_isolation_contracts ON ess_contracts
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);
