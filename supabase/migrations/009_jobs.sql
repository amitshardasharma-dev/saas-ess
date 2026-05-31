-- Migration: 009_jobs.sql
-- Phase: 0
-- Description: Background job queue consumed by the cron runner
--   (src/app/api/cron/run-jobs) via src/lib/jobs/dispatch.ts.

CREATE TABLE IF NOT EXISTS ess_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	company_id uuid REFERENCES ess_companies(id),
	type text NOT NULL,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'running', 'done', 'failed')),
	run_at timestamptz NOT NULL DEFAULT now(),
	attempts int NOT NULL DEFAULT 0,
	max_attempts int NOT NULL DEFAULT 5,
	last_error text,
	locked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- The claim query selects pending jobs whose run_at <= now(), ordered by run_at.
CREATE INDEX IF NOT EXISTS idx_ess_jobs_status_run_at ON ess_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_ess_jobs_company_id ON ess_jobs(company_id);

-- RLS in the same migration (conventions §6.3 / §3d).
-- company_id is nullable for platform-level jobs; the cron runner uses the
-- service role, which bypasses RLS to claim across all tenants.
ALTER TABLE ess_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_jobs ON ess_jobs;
CREATE POLICY tenant_isolation_jobs ON ess_jobs
	USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::uuid);
