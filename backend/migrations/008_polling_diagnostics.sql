-- Migration 008: Persist polling diagnostics
--
-- `runs_scanned` already records how many workflow runs were inspected and
-- `failures_detected` records how many incidents/occurrences were created.
-- `failed_runs` records how many of the inspected runs actually concluded in
-- failure/timed_out/cancelled, which is what the Live Monitor reports as
-- "failed runs found".

ALTER TABLE monitoring_state
  ADD COLUMN IF NOT EXISTS failed_runs INTEGER NOT NULL DEFAULT 0;
