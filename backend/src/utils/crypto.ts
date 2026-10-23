import crypto from 'node:crypto';

/**
 * Cryptographic helpers.
 *
 * Passwords are hashed with scrypt (memory hard), session tokens are only
 * ever stored as a SHA-256 digest, and third-party credentials such as GitHub
 * personal access tokens are encrypted with AES-256-GCM before they touch the
 * database.
 */

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/**
 * Hashes a password with a random salt.
 *
 * Format: `scrypt$N$r$p$saltHex$hashHex`
 */
export const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$');
};

/**
 * Verifies a password against a stored hash in constant time.
 */
export const verifyPassword = (password: string, stored: string): boolean => {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = crypto.scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });

  return crypto.timingSafeEqual(derived, expected);
};

/**
 * Creates a high-entropy opaque session token.
 */
export const generateSessionToken = (): string => crypto.randomBytes(32).toString('hex');

/**
 * Hashes a session token so only the digest is persisted.
 */
export const hashSessionToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Encrypts a secret with AES-256-GCM.
 *
 * Format: `v1:<ivHex>:<authTagHex>:<ciphertextHex>`
 */
export const encryptSecret = (plaintext: string, key: Buffer): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
};

/**
 * Decrypts a value produced by `encryptSecret`.
 */
export const decryptSecret = (payload: string, key: Buffer): string => {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unsupported encrypted payload format.');
  }

  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const ciphertext = Buffer.from(parts[3], 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

/**
 * Returns the last few characters of a token so it can be shown without
 * revealing the secret.
 */
export const tokenHint = (token: string): string => {
  const trimmed = token.trim();
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
};
