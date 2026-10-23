-- Migration 009: AI Task Verification and Acceptance Criteria
-- Additive migration for automated task verification reports, review lifecycle, and criteria

-- 1. Extend tasks.status check constraint to include 'CHANGES_REQUESTED'
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES_REQUESTED', 'DONE'));

-- 2. Add optional structured acceptance criteria column to tasks
ALTER TABLE tasks 
  ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT[] DEFAULT '{}'::TEXT[];

-- 3. Create task_verifications table for persistent structured reports
CREATE TABLE IF NOT EXISTS task_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  overall_verdict TEXT NOT NULL CHECK (overall_verdict IN ('SATISFIED', 'PARTIALLY_SATISFIED', 'UNMET', 'INSUFFICIENT_EVIDENCE', 'ERROR')),
  summary TEXT NOT NULL,
  confidence_score NUMERIC(3, 2), -- 0.00 to 1.00
  requirements_coverage JSONB NOT NULL DEFAULT '[]'::jsonb,
  inspected_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps_and_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitations TEXT,
  recommendation TEXT NOT NULL,
  associated_commit_shas TEXT[] DEFAULT '{}'::TEXT[],
  associated_pr_numbers INT[] DEFAULT '{}'::INT[],
  diff_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_error TEXT,
  triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_decision TEXT CHECK (review_decision IN ('APPROVED', 'CHANGES_REQUESTED', null)),
  review_feedback TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_verifications_task_id ON task_verifications(task_id);
CREATE INDEX IF NOT EXISTS idx_task_verifications_project_id ON task_verifications(project_id);
CREATE INDEX IF NOT EXISTS idx_task_verifications_created_at ON task_verifications(created_at DESC);
