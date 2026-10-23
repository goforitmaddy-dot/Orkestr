-- Migration 011: Expose the configured live server URL on the project row
--
-- The Live Monitor and project detail pages read `server_url` from the project
-- record to decide whether to show server health. Keeping it on `projects`
-- (in addition to `server_monitoring_configs`) lets the project list/detail
-- endpoints return it without an extra round-trip.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS server_url TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_server_url ON projects(server_url) WHERE server_url IS NOT NULL;
