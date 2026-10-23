import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { z } from 'zod';
import { query } from '../db';
import { publish } from './eventBus.service';
import { AppError } from '../middleware/errorHandler';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ServerHealthStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export type ServerErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ServerMonitoringConfigInput {
  serverUrl: string;
  environment: string;
  webhookUrl: string | null;
  notifyTeam: boolean;
  healthCheckIntervalMs: number;
  enabled: boolean;
}

export interface ServerMonitoringConfigRecord {
  project_id: string;
  server_url: string;
  environment: string;
  webhook_url: string | null;
  notify_team: boolean;
  health_check_interval_ms: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServerHealthRecord {
  project_id: string;
  status: ServerHealthStatus;
  response_time_ms: number | null;
  last_checked_at: string | null;
  uptime_percent: number | null;
  last_error: string | null;
  updated_at: string;
}

export interface ServerErrorInput {
  message: string;
  stackTrace?: string | null;
  severity?: ServerErrorSeverity;
  environment?: string | null;
}

export interface ServerErrorRecord {
  id: string;
  project_id: string;
  message: string;
  stack_trace: string | null;
  severity: ServerErrorSeverity;
  environment: string | null;
  occurred_at: string;
  resolved: boolean;
  resolved_at: string | null;
  fingerprint: string;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export const serverMonitoringConfigSchema = z.object({
  serverUrl: z
    .string({ required_error: 'serverUrl is required' })
    .trim()
    .min(1, 'serverUrl cannot be empty')
    .refine(
      (value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'serverUrl must be a valid http or https URL' }
    ),
  environment: z
    .string({ required_error: 'environment is required' })
    .trim()
    .min(1, 'environment cannot be empty')
    .refine(
      (value) => /^(production|staging|development)$/i.test(value),
      { message: "environment must be 'production', 'staging', or 'development'" }
    ),
  webhookUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (value) => {
        if (!value) return true;
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'webhookUrl must be a valid URL' }
    ),
  notifyTeam: z.boolean().optional().default(true),
  healthCheckIntervalMs: z
    .number({ required_error: 'healthCheckIntervalMs is required' })
    .int()
    .min(5000, 'healthCheckIntervalMs must be at least 5000 ms')
    .max(3600000, 'healthCheckIntervalMs must be at most 3600000 ms')
    .default(30000),
  enabled: z.boolean().optional().default(true),
});

export const serverErrorSchema = z.object({
  message: z
    .string({ required_error: 'message is required' })
    .trim()
    .min(1, 'message cannot be empty'),
  stackTrace: z.string().trim().optional().nullable(),
  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .default('medium'),
  environment: z.string().trim().optional().nullable(),
});

/* -------------------------------------------------------------------------- */
/* Health check (real HTTP request, never fabricated)                       */
/* -------------------------------------------------------------------------- */

const DEFAULT_HEALTH_TIMEOUT_MS = 5000;

const healthTimeoutMs = (): number => {
  const value = process.env.SERVER_HEALTH_TIMEOUT_MS;
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HEALTH_TIMEOUT_MS;
};

const performHttpCheck = (
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; statusCode?: number; error?: string }> => {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: 'request timed out' });
      }
    }, timeoutMs);

    const request = (url.startsWith('https:') ? https : http).request(
      url,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'orkestr-monitor/1.0' },
      },
      (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Consume the response body so the connection can be reused/closed.
        response.resume();
        response.on('end', () => {
          resolve({ ok: response.statusCode !== undefined && response.statusCode < 400, statusCode: response.statusCode });
        });
      }
    );

    request.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });

    request.on('timeout', () => {
      if (!settled) {
        settled = true;
        request.destroy(new Error('request timed out'));
      }
    });

    request.end();
  });
};

const classifyHealth = (
  result: { ok: boolean; statusCode?: number; error?: string }
): ServerHealthStatus => {
  if (result.error) return 'offline';
  if (result.ok) return 'online';
  return 'degraded';
};

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Upserts the live server monitoring configuration for a project.
 *
 * Only the project owner (or an account with access to an ownerless project)
 * may configure monitoring. Returns the persisted configuration.
 */
export const upsertServerMonitoringConfig = async (
  projectId: string,
  input: ServerMonitoringConfigInput,
  ownerId?: string | null
): Promise<ServerMonitoringConfigRecord> => {
  const validated = serverMonitoringConfigSchema.parse(input);

  // Verify the caller can access the project before writing config.
  const project = await query<{ id: string }>(
    `SELECT id FROM projects
     WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL);`,
    [projectId, ownerId ?? null]
  );
  if (project.rows.length === 0) {
    throw new AppError(`Project with ID ${projectId} not found`, 404);
  }

  const existing = await query<ServerMonitoringConfigRecord>(
    `SELECT * FROM server_monitoring_configs WHERE project_id = $1;`,
    [projectId]
  );

  if (existing.rows.length > 0) {
    const updated = await query<ServerMonitoringConfigRecord>(
      `UPDATE server_monitoring_configs
       SET server_url = $1,
           environment = $2,
           webhook_url = $3,
           notify_team = $4,
           health_check_interval_ms = $5,
           enabled = $6,
           updated_at = NOW()
       WHERE project_id = $7
       RETURNING *;`,
      [
        validated.serverUrl,
        validated.environment,
        validated.webhookUrl ?? null,
        validated.notifyTeam,
        validated.healthCheckIntervalMs,
        validated.enabled,
        projectId,
      ]
    );

    await query(
      `UPDATE projects SET server_url = $1, updated_at = NOW() WHERE id = $2;`,
      [validated.serverUrl, projectId]
    );

    return updated.rows[0];
  }

  const inserted = await query<ServerMonitoringConfigRecord>(
    `INSERT INTO server_monitoring_configs (
      project_id, server_url, environment, webhook_url, notify_team,
      health_check_interval_ms, enabled
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;`,
    [
      projectId,
      validated.serverUrl,
      validated.environment,
      validated.webhookUrl ?? null,
      validated.notifyTeam,
      validated.healthCheckIntervalMs,
      validated.enabled,
    ]
  );

  // Mirror the configured URL onto the project row so the project list and
  // detail endpoints can surface it without an extra round-trip.
  await query(
    `UPDATE projects SET server_url = $1, updated_at = NOW() WHERE id = $2;`,
    [validated.serverUrl, projectId]
  );

  return inserted.rows[0];
};

/**
 * Disables (or re-enables) server monitoring for a project without losing the
 * configured URL.
 */
export const setServerMonitoringEnabled = async (
  projectId: string,
  enabled: boolean,
  ownerId?: string | null
): Promise<ServerMonitoringConfigRecord | null> => {
  const project = await query<{ id: string }>(
    `SELECT id FROM projects
     WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL);`,
    [projectId, ownerId ?? null]
  );
  if (project.rows.length === 0) return null;

  const updated = await query<ServerMonitoringConfigRecord>(
    `UPDATE server_monitoring_configs
     SET enabled = $1, updated_at = NOW()
     WHERE project_id = $2
     RETURNING *;`,
    [enabled, projectId]
  );
  return updated.rows[0] || null;
};

/**
 * Returns the persisted configuration for a project, or null if none exists.
 */
export const getServerMonitoringConfig = async (
  projectId: string,
  ownerId?: string | null
): Promise<ServerMonitoringConfigRecord | null> => {
  const project = await query<{ id: string }>(
    `SELECT id FROM projects
     WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL);`,
    [projectId, ownerId ?? null]
  );
  if (project.rows.length === 0) return null;

  const result = await query<ServerMonitoringConfigRecord>(
    `SELECT * FROM server_monitoring_configs WHERE project_id = $1;`,
    [projectId]
  );
  return result.rows[0] || null;
};

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Performs a real HTTP health check against the project's configured server
 * URL, persists the result, and returns the current health snapshot.
 *
 * A server with no configuration, or one that has never been checked, is
 * reported as 'unknown' - never fabricated as healthy.
 */
export const checkServerHealth = async (
  projectId: string,
  ownerId?: string | null
): Promise<ServerHealthRecord> => {
  const config = await getServerMonitoringConfig(projectId, ownerId);
  if (!config || !config.enabled) {
    // No configuration: explicitly unknown, never fabricate health.
    const existing = await query<ServerHealthRecord>(
      `SELECT * FROM server_health WHERE project_id = $1;`,
      [projectId]
    );
    if (existing.rows.length > 0) return existing.rows[0];

    const inserted = await query<ServerHealthRecord>(
      `INSERT INTO server_health (project_id, status, response_time_ms, last_checked_at, uptime_percent, last_error)
       VALUES ($1, 'unknown', null, null, null, null)
       RETURNING *;`,
      [projectId]
    );
    return inserted.rows[0];
  }

  const start = Date.now();
  const checkResult = await performHttpCheck(config.server_url, healthTimeoutMs());
  const responseTimeMs = Date.now() - start;
  const status = classifyHealth(checkResult);

  // Record this check in history so uptime can be computed honestly.
  await query(
    `INSERT INTO server_health_history (project_id, status, response_time_ms, checked_at, error_message)
     VALUES ($1, $2, $3, NOW(), $4);`,
    [projectId, status, responseTimeMs, checkResult.error ?? null]
  );

  // Uptime = share of online checks across all recorded checks.
  const uptime = await query<{ online: string; total: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'online')::text AS online,
       COUNT(*)::text AS total
     FROM server_health_history
     WHERE project_id = $1;`,
    [projectId]
  );
  const online = Number(uptime.rows[0]?.online || 0);
  const total = Number(uptime.rows[0]?.total || 0);
  const uptimePercent = total > 0 ? Math.round((online / total) * 10000) / 100 : null;

  const upserted = await query<ServerHealthRecord>(
    `INSERT INTO server_health (
      project_id, status, response_time_ms, last_checked_at, uptime_percent, last_error, updated_at
    ) VALUES ($1, $2, $3, NOW(), $4, $5, NOW())
    ON CONFLICT (project_id) DO UPDATE SET
      status = EXCLUDED.status,
      response_time_ms = EXCLUDED.response_time_ms,
      last_checked_at = EXCLUDED.last_checked_at,
      uptime_percent = EXCLUDED.uptime_percent,
      last_error = EXCLUDED.last_error,
      updated_at = NOW()
    RETURNING *;`,
    [projectId, status, responseTimeMs, uptimePercent, checkResult.error ?? null]
  );

  return upserted.rows[0];
};

/**
 * Verifies the caller can access the project (owner, or any account for
 * ownerless legacy projects). Throws 404 otherwise.
 */
const verifyProjectAccess = async (
  projectId: string,
  ownerId?: string | null
): Promise<void> => {
  const project = await query<{ id: string }>(
    `SELECT id FROM projects
     WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL);`,
    [projectId, ownerId ?? null]
  );
  if (project.rows.length === 0) {
    throw new AppError(`Project with ID ${projectId} not found`, 404);
  }
};

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Builds a stable fingerprint so repeated reports of the same server defect
 * collapse into a single trackable error instead of flooding the monitor.
 */
export const computeServerErrorFingerprint = (
  input: ServerErrorInput,
  projectId: string
): string => {
  const basis = [
    input.message.trim(),
    input.stackTrace?.trim() || '',
    input.environment?.trim() || '',
  ].join('||');

  const hash = crypto
    .createHash('sha256')
    .update(`${projectId}::server::${input.severity || 'medium'}::${basis}`)
    .digest('hex')
    .slice(0, 32);

  return `server:${hash}`;
};

/**
 * Records a server error reported by a running service.
 *
 * Repeated reports of the same fingerprint increment the occurrence counter
 * and refresh occurred_at instead of creating duplicate rows. A previously
 * resolved error that reappears is reopened as a new occurrence.
 */
export const recordServerError = async (
  projectId: string,
  input: ServerErrorInput,
  ownerId?: string | null
): Promise<{ record: ServerErrorRecord; created: boolean }> => {
  const validated = serverErrorSchema.parse(input);

  // Verify project access.
  const project = await query<{ id: string }>(
    `SELECT id FROM projects
     WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL);`,
    [projectId, ownerId ?? null]
  );
  if (project.rows.length === 0) {
    throw new AppError(`Project with ID ${projectId} not found`, 404);
  }

  const fingerprint = computeServerErrorFingerprint(validated, projectId);
  const severity = validated.severity;

  // Reopen a previously resolved error with the same fingerprint.
  const existing = await query<ServerErrorRecord>(
    `SELECT * FROM server_errors WHERE fingerprint = $1 AND project_id = $2;`,
    [fingerprint, projectId]
  );

  if (existing.rows.length > 0) {
    const current = existing.rows[0];

    // The same defect is still open: record another occurrence without
    // creating a new row (no flooding).
    if (!current.resolved) {
      const updated = await query<ServerErrorRecord>(
        `UPDATE server_errors
         SET occurrence_count = occurrence_count + 1,
             occurred_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *;`,
        [current.id]
      );
      const record = updated.rows[0];
      publish('error.updated', {
        id: record.id,
        projectId,
        fingerprint,
        message: record.message,
        severity: record.severity,
        environment: record.environment,
        source: 'server',
      });
      return { record, created: false };
    }

    // A previously resolved error regressed: reopen it as a new occurrence.
    const updated = await query<ServerErrorRecord>(
      `UPDATE server_errors
       SET occurrence_count = occurrence_count + 1,
           occurred_at = NOW(),
           resolved = FALSE,
           resolved_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *;`,
      [current.id]
    );
    const record = updated.rows[0];
    publish('error.created', {
      id: record.id,
      projectId,
      fingerprint,
      message: record.message,
      severity: record.severity,
      environment: record.environment,
      source: 'server',
    });
    return { record, created: true };
  }

  const inserted = await query<ServerErrorRecord>(
    `INSERT INTO server_errors (
      project_id, message, stack_trace, severity, environment, occurred_at,
      resolved, fingerprint, occurrence_count
    ) VALUES ($1, $2, $3, $4, $5, NOW(), FALSE, $6, 1)
    RETURNING *;`,
    [
      projectId,
      validated.message.trim(),
      validated.stackTrace ?? null,
      severity,
      validated.environment ?? null,
      fingerprint,
    ]
  );

  const record = inserted.rows[0];

  // Publish the error to the live event stream so connected monitors are
  // notified in real time. Server errors are deliberately not turned into
  // incidents (nothing is fabricated) and are not routed through
  // dispatchNotification, which requires an incident or application error to
  // attach a notification attempt to.
  publish('error.created', {
    id: record.id,
    projectId,
    fingerprint,
    message: record.message,
    severity: record.severity,
    environment: record.environment,
    source: 'server',
  });

  return { record, created: true };
};

/**
 * Lists server errors for a project, newest first, with optional filtering.
 */
export const listServerErrors = async (
  projectId: string,
  filters: {
    status?: 'open' | 'resolved' | 'all';
    severity?: ServerErrorSeverity;
    limit?: number;
    offset?: number;
    ownerId?: string | null;
  } = {}
): Promise<ServerErrorRecord[]> => {
  await verifyProjectAccess(projectId, filters.ownerId);

  const conditions: string[] = [`project_id = $1`];
  const values: unknown[] = [projectId];
  let idx = 2;

  if (filters.status && filters.status !== 'all') {
    conditions.push(`resolved = $${idx++}`);
    values.push(filters.status === 'resolved');
  }
  if (filters.severity) {
    conditions.push(`severity = $${idx++}`);
    values.push(filters.severity);
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  values.push(limit, offset);

  const result = await query<ServerErrorRecord>(
    `SELECT *
     FROM server_errors
     WHERE ${conditions.join(' AND ')}
     ORDER BY occurred_at DESC
     LIMIT $${idx++} OFFSET $${idx++};`,
    values
  );
  return result.rows;
};

/**
 * Marks a server error as resolved.
 */
export const resolveServerError = async (
  projectId: string,
  errorId: string,
  ownerId?: string | null
): Promise<ServerErrorRecord | null> => {
  await verifyProjectAccess(projectId, ownerId);

  const result = await query<ServerErrorRecord>(
    `UPDATE server_errors
     SET resolved = TRUE, resolved_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND project_id = $2
     RETURNING *;`,
    [errorId, projectId]
  );
  const record = result.rows[0] || null;
  if (record) {
    publish('error.resolved', { id: record.id, projectId, status: 'resolved' });
  }
  return record;
};
