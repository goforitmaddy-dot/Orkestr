-- Migration 003: Task Distribution Engine Schema Additions
-- Adds skills, capacity, and availability to users/members, and required_skills to tasks.

-- 1. Extend users table with skills, weekly capacity, and availability
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_capacity_hours INT NOT NULL DEFAULT 40 CHECK (weekly_capacity_hours > 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

-- 2. Extend tasks table with required_skills
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS required_skills TEXT[] NOT NULL DEFAULT '{}';

-- 3. GIN Indexes for efficient skill searches
CREATE INDEX IF NOT EXISTS idx_users_skills ON users USING gin(skills);
CREATE INDEX IF NOT EXISTS idx_tasks_required_skills ON tasks USING gin(required_skills);
