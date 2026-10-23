-- Migration 007: Real-Time Incident Notification & Escalation System

-- Extend incidents with notification/escalation/acknowledgment fields
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS team_assigned TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'monitoring',
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_status TEXT DEFAULT 'pending' CHECK (notification_status IN ('pending','skipped','queued','sent','failed','acknowledged')),
  ADD COLUMN IF NOT EXISTS investigation_status TEXT DEFAULT 'Investigating',
  ADD COLUMN IF NOT EXISTS dashboard_url TEXT,
  ADD COLUMN IF NOT EXISTS ai_investigation_note TEXT,
  ADD COLUMN IF NOT EXISTS root_cause_confirmed BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_incidents_fingerprint ON incidents(fingerprint);
CREATE INDEX IF NOT EXISTS idx_incidents_severity_status ON incidents(severity, status);
CREATE INDEX IF NOT EXISTS idx_incidents_team ON incidents(team_assigned);
CREATE INDEX IF NOT EXISTS idx_incidents_ack ON incidents(acknowledged_at) WHERE acknowledged_at IS NULL;

-- Extend application_errors similarly
ALTER TABLE application_errors
  ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS team_assigned TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS investigation_status TEXT DEFAULT 'Investigating',
  ADD COLUMN IF NOT EXISTS dashboard_url TEXT,
  ADD COLUMN IF NOT EXISTS ai_investigation_note TEXT;

CREATE INDEX IF NOT EXISTS idx_app_errors_fingerprint ON application_errors(fingerprint);
CREATE INDEX IF NOT EXISTS idx_app_errors_severity_status ON application_errors(severity, status);

-- Team routing rules
CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  conditions JSONB NOT NULL DEFAULT '{}', -- {service, environment, category, severity, repository}
  team TEXT NOT NULL,
  channels JSONB DEFAULT '["slack"]',
  escalation_policy JSONB DEFAULT '{"timeout_minutes": 30, "max_level": 3}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default routing rules
INSERT INTO notification_rules (name, priority, conditions, team, channels) VALUES
('Deployment failures', 100, '{"category": ["deployment", "ci_cd", "build"]}', 'DevOps / Platform Engineering', '["slack"]'),
('Infrastructure/availability', 90, '{"category": ["infrastructure", "availability", "network"]}', 'SRE', '["slack"]'),
('Database incidents', 80, '{"category": ["database", "db"]}', 'Backend / Database team', '["slack"]'),
('Frontend errors', 70, '{"category": ["frontend", "ui"]}', 'Frontend Engineering', '["slack"]'),
('Security alerts', 95, '{"category": ["security"]}', 'Security team', '["slack"]'),
('API errors', 60, '{"category": ["api"]}', 'Backend / SRE', '["slack"]')
ON CONFLICT DO NOTHING;

-- Notification attempts/delivery tracking
CREATE TABLE IF NOT EXISTS notification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID,
  application_error_id UUID,
  channel TEXT NOT NULL, -- slack, email, in_app
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','skipped')),
  provider TEXT,
  provider_response JSONB,
  message_preview TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_notification_target CHECK (incident_id IS NOT NULL OR application_error_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_notif_attempts_incident ON notification_attempts(incident_id);
CREATE INDEX IF NOT EXISTS idx_notif_attempts_error ON notification_attempts(application_error_id);
CREATE INDEX IF NOT EXISTS idx_notif_attempts_status ON notification_attempts(status);

-- Escalation history
CREATE TABLE IF NOT EXISTS incident_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  application_error_id UUID REFERENCES application_errors(id) ON DELETE CASCADE,
  from_team TEXT,
  to_team TEXT,
  level INTEGER DEFAULT 1,
  reason TEXT,
  escalated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_escalation_target CHECK (incident_id IS NOT NULL OR application_error_id IS NOT NULL)
);

-- Notification channel config (non-secret)
CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  configured BOOLEAN DEFAULT FALSE,
  config JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO notification_channels (name, enabled, configured) VALUES
('slack', FALSE, FALSE),
('email', FALSE, FALSE),
('in_app', TRUE, TRUE)
ON CONFLICT DO NOTHING;
