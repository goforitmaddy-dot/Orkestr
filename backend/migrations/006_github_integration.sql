-- 006_github_integration.sql
-- Additive schema migration for GitHub Identity Linking and Repository Connection foundation

-- 1. Add GitHub identity linking fields to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS github_user_id BIGINT UNIQUE,
  ADD COLUMN IF NOT EXISTS github_username TEXT,
  ADD COLUMN IF NOT EXISTS github_linked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_github_user_id ON users(github_user_id);

-- 2. Add GitHub repository connection fields to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS github_repo_id BIGINT,
  ADD COLUMN IF NOT EXISTS github_repo_owner TEXT,
  ADD COLUMN IF NOT EXISTS github_repo_name TEXT,
  ADD COLUMN IF NOT EXISTS github_installation_id BIGINT,
  ADD COLUMN IF NOT EXISTS github_default_branch TEXT DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS github_connection_status TEXT DEFAULT 'DISCONNECTED',
  ADD COLUMN IF NOT EXISTS github_connected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_github_repo_id ON projects(github_repo_id);

-- 3. Ephemeral OAuth state table for CSRF protection during GitHub identity linking
CREATE TABLE IF NOT EXISTS github_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  return_to TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_oauth_states_expires_at ON github_oauth_states(expires_at);

-- 4. GitHub webhook event storage with event_id deduplication (Foundation for Live Project Monitor)
CREATE TABLE IF NOT EXISTS github_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_github_webhook_events_event_id ON github_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_github_webhook_events_status ON github_webhook_events(status);
