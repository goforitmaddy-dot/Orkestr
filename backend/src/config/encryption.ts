import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves the key used to encrypt third-party credentials (GitHub tokens) at
 * rest.
 *
 * The key lives in `backend/.env` as `ENCRYPTION_KEY`. When it is missing a
 * key is generated and written back to the env file, so a fresh checkout works
 * without manual setup while the secret never ends up in version control.
 */

const backendRoot = path.resolve(__dirname, '../..');
const envPath = path.resolve(backendRoot, '.env');

let cachedKey: Buffer | null = null;

const parseKey = (raw: string): Buffer | null => {
  const value = raw.trim();
  if (!value) return null;

  if (/^[0-9a-f]{64}$/i.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 32) return decoded;

  return null;
};

const persistKey = (key: Buffer): void => {
  const line = `\n# Generated automatically - encrypts stored third-party credentials.\nENCRYPTION_KEY=${key.toString('hex')}\n`;

  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      if (/^ENCRYPTION_KEY=/m.test(content)) return;
      fs.appendFileSync(envPath, line);
    } else {
      fs.writeFileSync(envPath, line.trimStart(), { mode: 0o600 });
    }
  } catch (error) {
    console.warn(
      '⚠️  Could not persist ENCRYPTION_KEY to backend/.env. Set it manually with:',
      (error as Error).message
    );
  }
};

/**
 * Returns the 32 byte encryption key, generating and persisting one if the
 * environment does not provide it.
 */
export const getEncryptionKey = (): Buffer => {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv) {
    const parsed = parseKey(fromEnv);
    if (parsed) {
      cachedKey = parsed;
      return cachedKey;
    }

    throw new Error(
      'ENCRYPTION_KEY is set but invalid. Use 64 hex characters or a base64 encoded 32 byte key.'
    );
  }

  const generated = crypto.randomBytes(32);
  persistKey(generated);
  process.env.ENCRYPTION_KEY = generated.toString('hex');
  cachedKey = generated;

  console.log('🔐 Generated a new ENCRYPTION_KEY and stored it in backend/.env.');

  return cachedKey;
};
