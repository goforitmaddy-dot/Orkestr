-- ---------------------------------------------------------------------------
-- 5. Runtime error ownership
-- ---------------------------------------------------------------------------
-- Runtime errors are reported by services and shown in the monitor. They now
-- belong to the account that reported them so two accounts never share
-- counters or see each other's errors.
ALTER TABLE application_errors
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_application_errors_owner ON application_errors(owner_id);

-- Existing errors inherit the owner of the project they are linked to.
-- Errors without a project stay unowned and remain visible to every account.
UPDATE application_errors ae
SET owner_id = p.owner_id
FROM projects p
WHERE ae.project_id = p.id
  AND ae.owner_id IS NULL
  AND p.owner_id IS NOT NULL;
