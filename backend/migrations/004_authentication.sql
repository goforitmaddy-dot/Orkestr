-- Migration 004: Authentication V1 Schema
-- Adds password_hash to users table (nullable to preserve legacy user records)
-- Adds session table for PostgreSQL-backed express-session store

-- 1. Extend users table with password_hash
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Create PostgreSQL session table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- 3. Case-insensitive unique index on email if not already present
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
