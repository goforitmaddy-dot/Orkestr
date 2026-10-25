-- Migration 005: Add username to users table
-- Adds unique username column for registered Orkestr accounts

-- 1. Add username column if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Backfill existing users with unique usernames derived from email prefix or name
UPDATE users
SET username = LOWER(REGEXP_REPLACE(SPLIT_PART(email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
WHERE username IS NULL;

-- Ensure minimum length and uniqueness for any edge cases
UPDATE users
SET username = 'user_' || SUBSTRING(id::text, 1, 8)
WHERE username IS NULL OR LENGTH(username) < 2;

-- Resolve any potential duplicates among existing backfilled users
WITH numbered AS (
  SELECT id, username,
         ROW_NUMBER() OVER (PARTITION BY LOWER(username) ORDER BY created_at ASC) as rn
  FROM users
)
UPDATE users u
SET username = u.username || '_' || (n.rn - 1)::text
FROM numbered n
WHERE u.id = n.id AND n.rn > 1;

-- 3. Case-insensitive unique index on username
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
