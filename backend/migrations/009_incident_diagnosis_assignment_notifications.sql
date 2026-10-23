-- Migration 009: Incident Diagnosis, Assignment, Teams, Enhanced Notifications

-- Extend incidents with diagnosis and assignment fields
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS diagnosis_status TEXT DEFAULT 'pending' CHECK (diagnosis_status IN ('pending','analyzing','completed','failed')),
  ADD COLUMN IF NOT EXISTS diagnosis_summary TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis_likely_root_cause TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis_evidence JSONB,
  ADD COLUMN IF NOT EXISTS diagnosis_error_location JSONB,
  ADD COLUMN IF NOT EXISTS diagnosis_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS diagnosis_recommended_actions JSONB,
  ADD COLUMN IF NOT EXISTS diagnosis_related_files JSONB,
  ADD COLUMN IF NOT EXISTS diagnosis_limitations TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis_raw JSONB,
  ADD COLUMN IF NOT EXISTS diagnosis_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_individual_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_individual_name TEXT,
  ADD COLUMN IF NOT EXISTS assignment_status TEXT DEFAULT 'unassigned' CHECK (assignment_status IN ('unassigned','assigned','reassigned')),
  ADD COLUMN IF NOT EXISTS commit_sha TEXT,
  ADD COLUMN IF NOT EXISTS run_url TEXT,
  ADD COLUMN IF NOT EXISTS job_name TEXT,
  ADD COLUMN IF NOT EXISTS step_name TEXT,
  ADD COLUMN IF NOT EXISTS log_excerpt_full TEXT;

-- Extend failure_occurrences
ALTER TABLE failure_occurrences
  ADD COLUMN IF NOT EXISTS commit_sha TEXT,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS line_number INTEGER,
  ADD COLUMN IF NOT EXISTS stack_trace TEXT;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  notification_channels JSONB DEFAULT '["slack"]',
  slack_channel TEXT,
  email_recipients JSONB DEFAULT '[]',
  on_call BOOLEAN DEFAULT FALSE,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  slack_user_id TEXT,
  role TEXT,
  on_call BOOLEAN DEFAULT FALSE,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repository to team mapping
CREATE TABLE IF NOT EXISTS repository_team_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_name TEXT NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  path_patterns JSONB DEFAULT '[]',
  error_categories JSONB DEFAULT '[]',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repository_name, team_id)
);

-- Assignment history
CREATE TABLE IF NOT EXISTS incident_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  assigned_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  assigned_team_name TEXT,
  assigned_individual_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  assigned_individual_name TEXT,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assignment_status TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhanced notification attempts
ALTER TABLE notification_attempts
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS retryable BOOLEAN DEFAULT TRUE;

-- Seed default teams
INSERT INTO teams (name, description, notification_channels, on_call) VALUES
  ('On-call Engineering', 'Default on-call team', '["slack"]', TRUE),
  ('DevOps / Platform Engineering', 'CI/CD and infrastructure', '["slack"]', FALSE),
  ('SRE', 'Site reliability', '["slack"]', FALSE),
  ('Backend / Database team', 'Backend and database', '["slack"]', FALSE),
  ('Frontend Engineering', 'Frontend and UI', '["slack"]', FALSE),
  ('Security team', 'Security incidents', '["slack"]', FALSE)
ON CONFLICT (name) DO NOTHING;

-- Seed repo mappings if needed
INSERT INTO repository_team_mappings (repository_name, team_id, priority)
SELECT r.repository_name, t.id, 10
FROM (SELECT DISTINCT repository_name FROM incidents) r
CROSS JOIN teams t
WHERE t.name = 'On-call Engineering'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_incidents_diagnosis_status ON incidents(diagnosis_status);
CREATE INDEX IF NOT EXISTS idx_incidents_assignment_status ON incidents(assignment_status);
CREATE INDEX IF NOT EXISTS idx_incident_assignments_incident ON incident_assignments(incident_id);
CREATE INDEX IF NOT EXISTS idx_notification_attempts_incident ON notification_attempts(incident_id);
