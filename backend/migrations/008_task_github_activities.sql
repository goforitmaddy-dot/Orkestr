-- Migration 008: Task-to-GitHub Activity Associations and Task Numbering

-- 1. Ensure tasks have a human-readable task_number (e.g. ORK-1, ORK-2, ORK-42)
CREATE SEQUENCE IF NOT EXISTS task_number_seq;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_number INT DEFAULT nextval('task_number_seq');

-- Backfill any existing tasks without a task_number
UPDATE tasks SET task_number = nextval('task_number_seq') WHERE task_number IS NULL;

ALTER TABLE tasks ALTER COLUMN task_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_number ON tasks(task_number);

-- 2. Task-to-GitHub Activity Association table
CREATE TABLE IF NOT EXISTS task_github_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  webhook_event_id UUID REFERENCES github_webhook_events(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('COMMIT', 'PULL_REQUEST')),
  github_identifier TEXT NOT NULL,
  github_url TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  branch TEXT,
  author_github_username TEXT,
  author_github_id BIGINT,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  github_created_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_task_github_activity UNIQUE (task_id, activity_type, github_identifier)
);

CREATE INDEX IF NOT EXISTS idx_task_github_activities_task_id ON task_github_activities(task_id);
CREATE INDEX IF NOT EXISTS idx_task_github_activities_project_id ON task_github_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_task_github_activities_github_identifier ON task_github_activities(github_identifier);
CREATE INDEX IF NOT EXISTS idx_task_github_activities_created_at ON task_github_activities(created_at DESC);
