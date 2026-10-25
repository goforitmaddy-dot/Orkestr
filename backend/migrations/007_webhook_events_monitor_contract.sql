-- 007_webhook_events_monitor_contract.sql
-- Additive migration for Live Project Monitor contract and repository uniqueness

-- 1. Prevent multiple active projects from connecting to the same GitHub repository
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_active_github_repo_id
  ON projects (github_repo_id)
  WHERE github_connection_status = 'CONNECTED' AND github_repo_id IS NOT NULL;

-- 2. Enhance webhook event tracking with error, retry, and identifier fields for Monitor module
ALTER TABLE github_webhook_events
  ADD COLUMN IF NOT EXISTS github_installation_id BIGINT,
  ADD COLUMN IF NOT EXISTS github_repo_id BIGINT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_github_webhook_events_repo_id
  ON github_webhook_events (github_repo_id);

CREATE INDEX IF NOT EXISTS idx_github_webhook_events_installation_id
  ON github_webhook_events (github_installation_id);
