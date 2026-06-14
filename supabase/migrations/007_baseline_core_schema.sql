-- Migration: 007_baseline_core_schema.sql
-- Phase: 0
-- Description: Baseline the un-migrated / hand-modified core schema so a fresh
--   `supabase db reset` reproduces the live DB. Reverse-engineered from the code
--   that queries these tables (see PRODUCT_STATE.md §2 and the API routes).
--
--   Everything here is idempotent: CREATE TABLE IF NOT EXISTS for tables that were
--   created by hand on the live DB (ess_app_users, ess_leave_balances,
--   ess_approval_rules) and ALTER TABLE ... ADD COLUMN IF NOT EXISTS for the
--   columns that were added by hand to tables 001-005 created.
--
--   006/007 ORDERING: migration 006 enables RLS / policies on tables that this
--   migration creates (ess_app_users, ess_leave_balances, ess_approval_rules).
--   On a fresh reset 006 runs BEFORE 007 and would fail. See MERGE_NOTES.md for
--   the resolution: RLS for every core table is (re)asserted idempotently in
--   010_rls_completion.sql, and the recommended fresh-DB order is documented
--   there. This migration therefore does NOT depend on 006 having succeeded.

-- ---------------------------------------------------------------------------
-- Tables that were created by hand on the live DB (never in a migration).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ess_app_users (
	id uuid PRIMARY KEY,
	company_id uuid REFERENCES ess_companies(id),
	email text,
	role text NOT NULL DEFAULT 'employee',
	is_super_admin boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ess_leave_balances (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	company_id uuid NOT NULL REFERENCES ess_companies(id),
	employee_id uuid REFERENCES ess_employees(id),
	leave_type_id uuid REFERENCES ess_leave_types(id),
	balance numeric NOT NULL DEFAULT 0,
	year int,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ess_approval_rules (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	company_id uuid NOT NULL REFERENCES ess_companies(id),
	entity text,
	min_amount numeric,
	approver_role text,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Columns added by hand to tables created in migrations 002-005.
-- ---------------------------------------------------------------------------

-- ess_employees (002): user_id, salary, address, hire_date, status
ALTER TABLE ess_employees ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE ess_employees ADD COLUMN IF NOT EXISTS salary numeric;
ALTER TABLE ess_employees ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE ess_employees ADD COLUMN IF NOT EXISTS hire_date date;
ALTER TABLE ess_employees ADD COLUMN IF NOT EXISTS status text;

-- ess_leave_types (003): days_per_year
ALTER TABLE ess_leave_types ADD COLUMN IF NOT EXISTS days_per_year int;

-- ess_leave_requests (003): leave_type_id, start_date, end_date, approver_id
ALTER TABLE ess_leave_requests ADD COLUMN IF NOT EXISTS leave_type_id uuid REFERENCES ess_leave_types(id);
ALTER TABLE ess_leave_requests ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE ess_leave_requests ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE ess_leave_requests ADD COLUMN IF NOT EXISTS approver_id uuid;

-- ess_expense_reports (004): status, total
ALTER TABLE ess_expense_reports ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE ess_expense_reports ADD COLUMN IF NOT EXISTS total numeric;

-- ess_expense_items (004): amount, receipt_path
ALTER TABLE ess_expense_items ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE ess_expense_items ADD COLUMN IF NOT EXISTS receipt_path text;

-- ess_contracts (005): signed_at
ALTER TABLE ess_contracts ADD COLUMN IF NOT EXISTS signed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Indexes (§5.6): foreign keys + the (company_id, id) lookup paths exercised by
-- the IDOR ownership checks. All IF NOT EXISTS so re-runs are safe.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ess_app_users_company_id ON ess_app_users(company_id);

CREATE INDEX IF NOT EXISTS idx_ess_employees_company_id ON ess_employees(company_id);
CREATE INDEX IF NOT EXISTS idx_ess_employees_company_id_id ON ess_employees(company_id, id);
CREATE INDEX IF NOT EXISTS idx_ess_employees_user_id ON ess_employees(user_id);

CREATE INDEX IF NOT EXISTS idx_ess_leave_types_company_id ON ess_leave_types(company_id);

CREATE INDEX IF NOT EXISTS idx_ess_leave_requests_company_id ON ess_leave_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_ess_leave_requests_company_id_id ON ess_leave_requests(company_id, id);
CREATE INDEX IF NOT EXISTS idx_ess_leave_requests_employee_id ON ess_leave_requests(employee_id);

CREATE INDEX IF NOT EXISTS idx_ess_leave_balances_company_id ON ess_leave_balances(company_id);
CREATE INDEX IF NOT EXISTS idx_ess_leave_balances_employee_id ON ess_leave_balances(employee_id);

CREATE INDEX IF NOT EXISTS idx_ess_expense_reports_company_id ON ess_expense_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_ess_expense_reports_company_id_id ON ess_expense_reports(company_id, id);

CREATE INDEX IF NOT EXISTS idx_ess_expense_items_company_id ON ess_expense_items(company_id);
CREATE INDEX IF NOT EXISTS idx_ess_expense_items_company_id_id ON ess_expense_items(company_id, id);
CREATE INDEX IF NOT EXISTS idx_ess_expense_items_report_id ON ess_expense_items(report_id);

CREATE INDEX IF NOT EXISTS idx_ess_approval_rules_company_id ON ess_approval_rules(company_id);

CREATE INDEX IF NOT EXISTS idx_ess_contracts_company_id ON ess_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_ess_contracts_company_id_id ON ess_contracts(company_id, id);
CREATE INDEX IF NOT EXISTS idx_ess_contracts_employee_id ON ess_contracts(employee_id);

-- ---------------------------------------------------------------------------
-- RLS for the three tables this migration creates. (The other core tables get
-- their RLS in 006 on the live DB; 010_rls_completion.sql re-asserts ALL core
-- policies idempotently for fresh resets.) Per conventions §6.3 every new table
-- ships RLS in the SAME migration that creates it.
-- ---------------------------------------------------------------------------

ALTER TABLE ess_app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_approval_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_app_users ON ess_app_users;
CREATE POLICY tenant_isolation_app_users ON ess_app_users
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_leave_balances ON ess_leave_balances;
CREATE POLICY tenant_isolation_leave_balances ON ess_leave_balances
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);

DROP POLICY IF EXISTS tenant_isolation_approval_rules ON ess_approval_rules;
CREATE POLICY tenant_isolation_approval_rules ON ess_approval_rules
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);
