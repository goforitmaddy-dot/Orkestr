-- Migration 004: Accounts, sessions and per-user GitHub connections

-- ---------------------------------------------------------------------------
-- 1. Accounts: give users a credential so we can tell them apart
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- 2. Sessions: opaque server-side session tokens (only the hash is stored)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ---------------------------------------------------------------------------
-- 3. GitHub connections: one token per user, encrypted at rest
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  account_login TEXT,
  account_id TEXT,
  token_encrypted TEXT NOT NULL,
  token_hint TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'valid', 'invalid')),
  last_validated_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_github_connection_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_github_connections_user ON github_connections(user_id);

-- ---------------------------------------------------------------------------
-- 4. Projects remember who owns them, so the poller can use their token
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);

-- Any project created before accounts existed stays unowned and is polled with
-- the fallback token from the server environment.
UPDATE projects SET owner_id = NULL WHERE owner_id IS NULL;
