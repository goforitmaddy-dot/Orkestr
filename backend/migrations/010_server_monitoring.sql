-- Migration 010: Live server monitoring
--
-- Tracks the live server URL configured for each project, the health of that
-- server as observed by Orkestr, and server errors/crashes reported by the
-- running service. CI workflow failures remain in incidents/workflow_runs and
-- are never mixed with live server errors.

-- 1. Per-project server monitoring configuration.
CREATE TABLE IF NOT EXISTS server_monitoring_configs (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  server_url TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  webhook_url TEXT,
  notify_team BOOLEAN NOT NULL DEFAULT TRUE,
  health_check_interval_ms INTEGER NOT NULL DEFAULT 30000,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_monitoring_configs_enabled
  ON server_monitoring_configs(enabled);

-- 2. Last known health snapshot for each configured server.
--
-- status is 'unknown' until the server has been checked at least once; Orkestr
-- never fabricates a healthy status for an unchecked server.
CREATE TABLE IF NOT EXISTS server_health (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('online', 'degraded', 'offline', 'unknown')),
  response_time_ms INTEGER,
  last_checked_at TIMESTAMPTZ,
  uptime_percent NUMERIC(5, 2),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. History of every health check so uptime can be computed honestly.
CREATE TABLE IF NOT EXISTS server_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  response_time_ms INTEGER,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_server_health_history_project
  ON server_health_history(project_id, checked_at DESC);

-- 4. Server errors / crashes reported by the running service.
--
-- Repeated reports of the same defect are grouped by fingerprint so the
-- monitor does not flood. Each row is a real report - nothing is fabricated.
CREATE TABLE IF NOT EXISTS server_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  stack_trace TEXT,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  environment TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  fingerprint TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_errors_project ON server_errors(project_id);
CREATE INDEX IF NOT EXISTS idx_server_errors_resolved ON server_errors(resolved, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_errors_fingerprint ON server_errors(fingerprint);
CREATE INDEX IF NOT EXISTS idx_server_errors_occurred_at ON server_errors(occurred_at DESC);
