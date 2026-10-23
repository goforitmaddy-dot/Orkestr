import { query } from '../db';
import { config } from '../config/env';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../utils/crypto';

/**
 * Account and session management.
 *
 * Sessions are opaque random tokens. Only their SHA-256 digest is stored, and
 * the raw token only ever exists in the user's cookie.
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface SessionResult {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

interface UserRow {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

const toAuthUser = (row: UserRow): AuthUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  is_active: row.is_active !== false,
  created_at: row.created_at,
});

/**
 * Creates a new account.
 */
export const createUser = async (input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> => {
  const email = normalizeEmail(input.email);
  const passwordHash = hashPassword(input.password);

  const result = await query<UserRow>(
    `INSERT INTO users (name, email, password_hash, is_active)
     VALUES ($1, $2, $3, TRUE)
     RETURNING id, name, email, is_active, created_at;`,
    [input.name.trim(), email, passwordHash]
  );

  return toAuthUser(result.rows[0]);
};

/**
 * Finds an account by email address.
 */
export const findUserByEmail = async (email: string): Promise<(AuthUser & { password_hash: string | null }) | null> => {
  const result = await query<UserRow & { password_hash: string | null }>(
    `SELECT id, name, email, is_active, created_at, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1);`,
    [normalizeEmail(email)]
  );

  const row = result.rows[0];
  if (!row) return null;

  return { ...toAuthUser(row), password_hash: row.password_hash };
};

/**
 * Finds an account by id.
 */
export const findUserById = async (id: string): Promise<AuthUser | null> => {
  const result = await query<UserRow>(
    `SELECT id, name, email, is_active, created_at
     FROM users
     WHERE id = $1;`,
    [id]
  );

  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
};

/**
 * Updates the display name of an account.
 */
export const updateUserProfile = async (userId: string, name: string): Promise<AuthUser | null> => {
  const result = await query<UserRow>(
    `UPDATE users
     SET name = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, is_active, created_at;`,
    [userId, name.trim()]
  );

  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
};

/**
 * Verifies credentials and returns the matching account.
 */
export const authenticate = async (
  email: string,
  password: string
): Promise<AuthUser | null> => {
  const user = await findUserByEmail(email);
  if (!user) {
    // Keep the timing roughly constant so the response does not reveal
    // whether the address exists.
    verifyPassword(password, 'scrypt$16384$8$1$00$00');
    return null;
  }

  if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  if (!user.is_active) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    is_active: user.is_active,
    created_at: user.created_at,
  };
};

/**
 * Creates a session for a user and returns the raw token.
 */
export const createSession = async (
  userId: string,
  userAgent?: string
): Promise<SessionResult> => {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + config.auth.sessionTtlMs);

  await query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4);`,
    [userId, tokenHash, userAgent ?? null, expiresAt]
  );

  const user = await findUserById(userId);
  if (!user) {
    throw new Error('Cannot create a session for an unknown user.');
  }

  return { user, token, expiresAt };
};

/**
 * Resolves a raw session token to its account.
 */
export const resolveSession = async (token: string): Promise<AuthUser | null> => {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);

  const result = await query(
    `UPDATE sessions
     SET last_used_at = NOW()
     WHERE token_hash = $1 AND expires_at > NOW()
     RETURNING user_id;`,
    [tokenHash]
  );

  const userId = result.rows[0]?.user_id;
  if (!userId) return null;

  return findUserById(userId);
};

/**
 * Ends a session.
 */
export const destroySession = async (token: string): Promise<void> => {
  if (!token) return;
  await query(`DELETE FROM sessions WHERE token_hash = $1;`, [hashSessionToken(token)]);
};

/**
 * Ends every session belonging to a user (used on password change).
 */
export const destroyUserSessions = async (userId: string): Promise<void> => {
  await query(`DELETE FROM sessions WHERE user_id = $1;`, [userId]);
};

/**
 * Removes expired sessions.
 */
export const pruneSessions = async (): Promise<void> => {
  await query(`DELETE FROM sessions WHERE expires_at <= NOW();`);
};
