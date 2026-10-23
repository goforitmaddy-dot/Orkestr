import { query } from '../db';
import { getEncryptionKey } from '../config/encryption';
import { decryptSecret, encryptSecret, tokenHint } from '../utils/crypto';

/**
 * Per-user GitHub connections.
 *
 * Each account stores its own personal access token. The token is encrypted
 * with AES-256-GCM before it is written to the database and is never returned
 * to the client - only a short hint and the validation state are exposed.
 */

export interface GitHubConnection {
  id: string;
  user_id: string;
  provider: string;
  account_login: string | null;
  account_id: string | null;
  token_hint: string;
  scopes: string[];
  status: 'unverified' | 'valid' | 'invalid';
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredConnection extends GitHubConnection {
  token: string;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  provider: string;
  account_login: string | null;
  account_id: string | null;
  token_encrypted: string;
  token_hint: string;
  scopes: string[];
  status: 'unverified' | 'valid' | 'invalid';
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const toConnection = (row: ConnectionRow): GitHubConnection => ({
  id: row.id,
  user_id: row.user_id,
  provider: row.provider,
  account_login: row.account_login,
  account_id: row.account_id,
  token_hint: row.token_hint,
  scopes: Array.isArray(row.scopes) ? row.scopes : [],
  status: row.status,
  last_validated_at: row.last_validated_at,
  last_error: row.last_error,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/**
 * Lists the connections of a user (without the secret).
 */
export const listConnections = async (userId: string): Promise<GitHubConnection[]> => {
  const result = await query<ConnectionRow>(
    `SELECT * FROM github_connections
     WHERE user_id = $1
     ORDER BY created_at ASC;`,
    [userId]
  );

  return result.rows.map(toConnection);
};

/**
 * Returns the connection of a user including the decrypted token.
 */
export const getConnectionWithToken = async (
  userId: string,
  provider = 'github'
): Promise<StoredConnection | null> => {
  const result = await query<ConnectionRow>(
    `SELECT * FROM github_connections
     WHERE user_id = $1 AND provider = $2;`,
    [userId, provider]
  );

  const row = result.rows[0];
  if (!row) return null;

  try {
    const token = decryptSecret(row.token_encrypted, getEncryptionKey());
    return { ...toConnection(row), token };
  } catch {
    // The encryption key changed or the payload is corrupted.
    return null;
  }
};

/**
 * Creates or replaces the connection of a user.
 */
export const saveConnection = async (input: {
  userId: string;
  provider: string;
  token: string;
  accountLogin?: string | null;
  accountId?: string | null;
  scopes?: string[];
  status?: 'unverified' | 'valid' | 'invalid';
  lastError?: string | null;
}): Promise<GitHubConnection> => {
  const token = input.token.trim();
  const encrypted = encryptSecret(token, getEncryptionKey());

  const result = await query<ConnectionRow>(
    `INSERT INTO github_connections (
       user_id, provider, account_login, account_id, token_encrypted, token_hint,
       scopes, status, last_validated_at, last_error
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'valid' THEN NOW() ELSE NULL END, $9)
     ON CONFLICT (user_id, provider)
     DO UPDATE SET
       account_login = EXCLUDED.account_login,
       account_id = EXCLUDED.account_id,
       token_encrypted = EXCLUDED.token_encrypted,
       token_hint = EXCLUDED.token_hint,
       scopes = EXCLUDED.scopes,
       status = EXCLUDED.status,
       last_validated_at = CASE
         WHEN EXCLUDED.status = 'valid' THEN NOW()
         ELSE github_connections.last_validated_at
       END,
       last_error = EXCLUDED.last_error,
       updated_at = NOW()
     RETURNING *;`,
    [
      input.userId,
      input.provider,
      input.accountLogin ?? null,
      input.accountId ?? null,
      encrypted,
      tokenHint(token),
      input.scopes ?? [],
      input.status ?? 'unverified',
      input.lastError ?? null,
    ]
  );

  return toConnection(result.rows[0]);
};

/**
 * Records the outcome of a validation attempt.
 */
export const updateConnectionStatus = async (
  connectionId: string,
  status: 'valid' | 'invalid',
  details: { accountLogin?: string | null; accountId?: string | null; scopes?: string[]; error?: string | null }
): Promise<GitHubConnection | null> => {
  const result = await query<ConnectionRow>(
    `UPDATE github_connections
     SET status = $2,
         account_login = COALESCE($3, account_login),
         account_id = COALESCE($4, account_id),
         scopes = COALESCE($5, scopes),
         last_validated_at = NOW(),
         last_error = $6,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *;`,
    [
      connectionId,
      status,
      details.accountLogin ?? null,
      details.accountId ?? null,
      details.scopes ?? null,
      details.error ?? null,
    ]
  );

  return result.rows[0] ? toConnection(result.rows[0]) : null;
};

/**
 * Removes a connection.
 */
export const deleteConnection = async (userId: string, connectionId: string): Promise<boolean> => {
  const result = await query(
    `DELETE FROM github_connections
     WHERE id = $1 AND user_id = $2
     RETURNING id;`,
    [connectionId, userId]
  );

  return result.rows.length > 0;
};
