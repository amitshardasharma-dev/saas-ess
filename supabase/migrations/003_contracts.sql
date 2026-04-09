CREATE TABLE IF NOT EXISTS ess_contract_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, requires_end_date BOOLEAN NOT NULL DEFAULT TRUE,
  default_duration_months INTEGER, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  contract_type_id UUID REFERENCES ess_contract_types(id),
  title TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Expired','Terminated','Renewed')),
  file_url TEXT, file_name TEXT, notes TEXT,
  renewal_reminder_days INTEGER NOT NULL DEFAULT 30,
  created_by UUID NOT NULL REFERENCES ess_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ess_contract_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES ess_contracts(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created','renewed','terminated','amended')),
  action_date TIMESTAMPTZ DEFAULT NOW(),
  performed_by UUID NOT NULL REFERENCES ess_employees(id),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_contracts_employee ON ess_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_contracts_company ON ess_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON ess_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contract_history ON ess_contract_history(contract_id);
ALTER TABLE ess_contract_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_contract_history ENABLE ROW LEVEL SECURITY;
