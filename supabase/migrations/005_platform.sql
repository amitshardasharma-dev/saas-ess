-- Add columns to ess_companies
ALTER TABLE ess_companies ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE ess_companies ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE ess_companies ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10;
ALTER TABLE ess_companies ADD COLUMN IF NOT EXISTS max_storage_mb INTEGER NOT NULL DEFAULT 500;

-- Platform plans
CREATE TABLE IF NOT EXISTS ess_platform_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  max_users INTEGER NOT NULL DEFAULT 10,
  max_storage_mb INTEGER NOT NULL DEFAULT 500,
  modules_allowed JSONB NOT NULL DEFAULT '["leave","expense"]'::jsonb,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant usage tracking
CREATE TABLE IF NOT EXISTS ess_tenant_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES ess_companies(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_count INTEGER NOT NULL DEFAULT 0,
  storage_used_mb INTEGER NOT NULL DEFAULT 0,
  active_employees INTEGER NOT NULL DEFAULT 0,
  timesheets_this_month INTEGER NOT NULL DEFAULT 0,
  leave_apps_this_month INTEGER NOT NULL DEFAULT 0,
  documents_count INTEGER NOT NULL DEFAULT 0
);

-- Announcements
CREATE TABLE IF NOT EXISTS ess_announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','warning','critical')),
  link_url TEXT,
  link_text TEXT,
  target_type TEXT NOT NULL DEFAULT 'all' CHECK (target_type IN ('all','specific_tenants','specific_plans')),
  target_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES ess_employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Announcement dismissals
CREATE TABLE IF NOT EXISTS ess_announcement_dismissals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id UUID NOT NULL REFERENCES ess_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_usage_company ON ess_tenant_usage(company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_date ON ess_tenant_usage(measured_at);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON ess_announcements(is_active, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_announcement_dismissals ON ess_announcement_dismissals(announcement_id, user_id);

-- RLS
ALTER TABLE ess_platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ess_announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- Seed default plans
INSERT INTO ess_platform_plans (name, slug, max_users, max_storage_mb, modules_allowed, price_monthly, price_yearly, sort_order) VALUES
  ('Free', 'free', 5, 100, '["leave","expense"]', 0, 0, 0),
  ('Starter', 'starter', 25, 500, '["leave","expense","timesheets","documents"]', 29, 290, 1),
  ('Professional', 'professional', 100, 2000, '["leave","expense","timesheets","documents","appraisals","contracts","team_calendar"]', 79, 790, 2),
  ('Enterprise', 'enterprise', 999, 10000, '["leave","expense","timesheets","documents","appraisals","contracts","team_calendar"]', 199, 1990, 3)
ON CONFLICT (slug) DO NOTHING;
