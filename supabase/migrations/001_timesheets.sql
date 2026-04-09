-- Timesheet configuration per company
CREATE TABLE IF NOT EXISTS ess_timesheet_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'simple_hours' CHECK (mode IN ('simple_hours', 'project_based', 'activity_based')),
  submission_cycle TEXT NOT NULL DEFAULT 'weekly' CHECK (submission_cycle IN ('weekly', 'fortnightly', 'monthly')),
  week_start_day INTEGER NOT NULL DEFAULT 1 CHECK (week_start_day BETWEEN 0 AND 6),
  required_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8,
  overtime_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  projects_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id)
);

-- Projects for project-based timesheets
CREATE TABLE IF NOT EXISTS ess_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  billable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timesheets (header per submission period)
CREATE TABLE IF NOT EXISTS ess_timesheets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved', 'Rejected', 'Revision Requested')),
  total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timesheet entries (individual time entries)
CREATE TABLE IF NOT EXISTS ess_timesheet_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timesheet_id UUID NOT NULL REFERENCES ess_timesheets(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 24),
  project_id UUID REFERENCES ess_projects(id),
  activity_category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timesheet approval entries (same pattern as leave/expense)
CREATE TABLE IF NOT EXISTS ess_timesheet_approval_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timesheet_id UUID NOT NULL REFERENCES ess_timesheets(id) ON DELETE CASCADE,
  level_no INTEGER NOT NULL,
  approver_id UUID NOT NULL REFERENCES ess_employees(id),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  action_time TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_timesheets_employee ON ess_timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_company ON ess_timesheets(company_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON ess_timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheets_period ON ess_timesheets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet ON ess_timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_date ON ess_timesheet_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_timesheet ON ess_timesheet_approval_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_approver ON ess_timesheet_approval_entries(approver_id);
CREATE INDEX IF NOT EXISTS idx_projects_company ON ess_projects(company_id);

-- RLS Policies
ALTER TABLE ess_timesheet_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_timesheet_approval_entries ENABLE ROW LEVEL SECURITY;
