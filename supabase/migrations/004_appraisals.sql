CREATE TABLE IF NOT EXISTS ess_appraisal_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_appraisal_cycles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES ess_appraisal_templates(id),
  name TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
  self_assessment_deadline DATE NOT NULL, manager_review_deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Active','Closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_appraisals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id UUID NOT NULL REFERENCES ess_appraisal_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES ess_employees(id),
  manager_id UUID NOT NULL REFERENCES ess_employees(id),
  status TEXT NOT NULL DEFAULT 'Pending Self' CHECK (status IN ('Pending Self','Pending Manager','Pending Review Meeting','Completed')),
  overall_rating NUMERIC(3,1), final_comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_appraisal_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appraisal_id UUID NOT NULL REFERENCES ess_appraisals(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL, respondent_type TEXT NOT NULL CHECK (respondent_type IN ('self','manager')),
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb, comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(appraisal_id, section_id, respondent_type)
);

CREATE TABLE IF NOT EXISTS ess_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES ess_appraisal_cycles(id),
  title TEXT NOT NULL, description TEXT, target_metric TEXT,
  current_progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started','In Progress','Completed','Deferred')),
  weight NUMERIC(5,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appraisal_templates_company ON ess_appraisal_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_cycles_company ON ess_appraisal_cycles(company_id);
CREATE INDEX IF NOT EXISTS idx_appraisals_cycle ON ess_appraisals(cycle_id);
CREATE INDEX IF NOT EXISTS idx_appraisals_employee ON ess_appraisals(employee_id);
CREATE INDEX IF NOT EXISTS idx_appraisals_manager ON ess_appraisals(manager_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_responses ON ess_appraisal_responses(appraisal_id);
CREATE INDEX IF NOT EXISTS idx_goals_employee ON ess_goals(employee_id);
ALTER TABLE ess_appraisal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_appraisal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_appraisal_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_goals ENABLE ROW LEVEL SECURITY;
