import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env file.
// Resolved relative to the backend package root (not process.cwd()) so the
// server and migration scripts work regardless of the directory they are
// launched from. Falls back to the current working directory if no file is
// found at the package root.
const backendRoot = path.resolve(__dirname, '../..');
const envPath = path.resolve(backendRoot, '.env');

dotenv.config({ path: envPath });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  database: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'ai_project_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  github: {
    /** Personal Access Token or GitHub App installation token. */
    token: process.env.GITHUB_TOKEN || '',
    /** Shared secret configured on the GitHub webhook. Enables HMAC verification. */
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    apiBaseUrl: process.env.GITHUB_API_BASE_URL || 'https://api.github.com',
    /** Default owner/org used when a project only stores a repository name. */
    defaultOwner: process.env.GITHUB_OWNER || '',
  },
  monitoring: {
    /** Master switch for the background CI poller. */
    enabled: process.env.MONITORING_ENABLED !== 'false',
    /** How often the poller scans monitored repositories for new failures. */
    pollIntervalMs: parseInt(process.env.MONITORING_POLL_INTERVAL_MS || '30000', 10),
    /** Only look at workflow runs created/updated after this lookback window on the first poll. */
    initialLookbackMinutes: parseInt(
      process.env.MONITORING_INITIAL_LOOKBACK_MINUTES || '60',
      10
    ),
    /** Maximum workflow runs fetched per repository per cycle. */
    maxRunsPerPoll: parseInt(process.env.MONITORING_MAX_RUNS_PER_POLL || '20', 10),
    /** Maximum bytes of a job log retained before excerpting (tail is preserved). */
    maxLogBytes: parseInt(process.env.MONITORING_MAX_LOG_BYTES || String(1024 * 1024), 10),
  },
  auth: {
    /** Session cookie name. */
    cookieName: process.env.SESSION_COOKIE_NAME || 'orkestr_session',
    /** Session lifetime in milliseconds (default 30 days). */
    sessionTtlMs: parseInt(process.env.SESSION_TTL_DAYS || '30', 10) * 24 * 60 * 60 * 1000,
    /** Only send the session cookie over HTTPS (disabled in development). */
    secureCookies: process.env.SESSION_SECURE_COOKIES === 'true',
  },
  notifications: {
    slackBotToken: process.env.SLACK_BOT_TOKEN || '',
    slackDefaultChannel: process.env.SLACK_DEFAULT_CHANNEL || '',
    incidentDashboardUrl: process.env.INCIDENT_DASHBOARD_URL || '',
    escalationTimeoutMinutes: parseInt(process.env.INCIDENT_ESCALATION_TIMEOUT_MINUTES || '30', 10),
  },
};

export const hasGitHubToken = (): boolean => {
  refreshGitHubCredentials();
  return config.github.token.length > 0;
};

/**
 * Reads a single key straight from the .env file.
 *
 * `dotenv` never overwrites variables that already exist in the process, so a
 * token pasted into the file after the server started would be ignored. This
 * helper bypasses that so credentials can be added without a restart.
 */
const readEnvValue = (key: string): string | null => {
  try {
    const content = fs.readFileSync(envPath, 'utf8');

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;
      if (line.slice(0, separator).trim() !== key) continue;

      let value = line.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {
    // The env file may not exist; fall back to the process environment.
  }

  return null;
};

/**
 * Re-reads the GitHub credentials from the .env file.
 */
export const refreshGitHubCredentials = (): void => {
  const token = readEnvValue('GITHUB_TOKEN');
  if (token !== null) config.github.token = token;

  const webhookSecret = readEnvValue('GITHUB_WEBHOOK_SECRET');
  if (webhookSecret !== null) config.github.webhookSecret = webhookSecret;
};

