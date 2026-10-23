-- ---------------------------------------------------------------------------
-- 6. Incident ownership
-- ---------------------------------------------------------------------------
-- CI incidents are detected from real workflow runs. They now carry the owner
-- of the project they belong to so accounts never see each other's failures.
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_incidents_owner ON incidents(owner_id);

-- Existing incidents inherit the owner of the project that monitors the same
-- repository.
UPDATE incidents i
SET owner_id = p.owner_id
FROM projects p
WHERE LOWER(p.repository) = LOWER(i.repository_name)
  AND i.owner_id IS NULL
  AND p.owner_id IS NOT NULL;
