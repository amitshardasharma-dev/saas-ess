-- Document categories
CREATE TABLE IF NOT EXISTS ess_document_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents
CREATE TABLE IF NOT EXISTS ess_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  category_id UUID REFERENCES ess_document_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  access_roles JSONB NOT NULL DEFAULT '["employee","manager","hr","admin"]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  requires_acknowledgment BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES ess_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document versions
CREATE TABLE IF NOT EXISTS ess_document_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES ess_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID NOT NULL REFERENCES ess_employees(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  changelog TEXT
);

-- Acknowledgments
CREATE TABLE IF NOT EXISTS ess_document_acknowledgments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES ess_documents(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES ess_document_versions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, version_id, employee_id)
);

-- Read tracking
CREATE TABLE IF NOT EXISTS ess_document_read_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES ess_documents(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES ess_employees(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, employee_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_company ON ess_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON ess_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON ess_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_acks_doc ON ess_document_acknowledgments(document_id);
CREATE INDEX IF NOT EXISTS idx_document_acks_employee ON ess_document_acknowledgments(employee_id);
CREATE INDEX IF NOT EXISTS idx_document_categories_company ON ess_document_categories(company_id);

-- RLS
ALTER TABLE ess_document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_document_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_document_read_tracking ENABLE ROW LEVEL SECURITY;
