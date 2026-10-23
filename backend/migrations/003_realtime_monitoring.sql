-- Migration 003: Real-time monitoring (CI failures + application runtime errors)

-- ---------------------------------------------------------------------------
-- 1. Link Projects to a source repository and enable/disable monitoring
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'github',
  ADD COLUMN IF NOT EXISTS repository TEXT,
  ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_poll_error TEXT;

-- A repository may only be attached to one project (avoids duplicate polling)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_provider_repository
  ON projects (provider, repository)
  WHERE repository IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Distinguish the origin of an incident
-- ---------------------------------------------------------------------------
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ci',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_source_check'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_source_check CHECK (source IN ('ci', 'runtime'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_incidents_source_status ON incidents(source, status);

-- ---------------------------------------------------------------------------
-- 3. Application runtime errors (exceptions surfaced by running services)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS application_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  repository_name TEXT,
  environment TEXT,
  service TEXT,
  error_type TEXT,
  message TEXT NOT NULL,
  stack_trace TEXT,
  fingerprint TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  affected_users INTEGER,
  release_version TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
  context JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_application_error_fingerprint UNIQUE (fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_application_errors_last_seen ON application_errors(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_errors_project ON application_errors(project_id);
CREATE INDEX IF NOT EXISTS idx_application_errors_status ON application_errors(status);

-- ---------------------------------------------------------------------------
-- 4. Track monitoring poll cycles (transparency + last-known-good state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitoring_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'github',
  target TEXT NOT NULL,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  runs_scanned INTEGER NOT NULL DEFAULT 0,
  failures_detected INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_monitoring_state_target UNIQUE (provider, target)
);
