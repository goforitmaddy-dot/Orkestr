import crypto from 'node:crypto';
import { query } from '../db';
import { publish } from './eventBus.service';
import { dispatchNotification } from './notification/dispatcher';
import { classifySeverity, classifyCategory, generateIncidentFingerprint } from './notificationPolicy';

/**
 * Application runtime error ingestion.
 *
 * Accepts exceptions reported by running services (Sentry-style payloads),
 * groups them by a stable fingerprint so repeated occurrences of the same
 * bug collapse into a single trackable error, and broadcasts the change to
 * every connected monitor.
 */

export interface ApplicationErrorInput {
  message: string;
  stackTrace?: string | null;
  errorType?: string | null;
  level?: string | null;
  environment?: string | null;
  service?: string | null;
  repository?: string | null;
  projectId?: string | null;
  release?: string | null;
  url?: string | null;
  affectedUsers?: number | null;
  fingerprint?: string | null;
  context?: Record<string, unknown> | null;
}

export interface ApplicationErrorRecord {
  id: string;
  project_id: string | null;
  repository_name: string | null;
  environment: string | null;
  service: string | null;
  error_type: string | null;
  message: string;
  stack_trace: string | null;
  fingerprint: string;
  occurrence_count: number;
  affected_users: number | null;
  release_version: string | null;
  source_url: string | null;
  status: 'OPEN' | 'RESOLVED' | 'IGNORED';
  context: Record<string, unknown> | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Normalises a stack trace into the leading frames used for grouping.
 */
const extractStackFrames = (stackTrace: string | null | undefined): string[] => {
  if (!stackTrace) return [];
  return stackTrace
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, 5)
    .map((line) => line.replace(/\s*\(.*\)$/, '').trim());
};

/**
 * Builds a stable fingerprint so the same defect reported repeatedly is
 * grouped into one error rather than flooding the monitor.
 */
export const computeFingerprint = (
  input: ApplicationErrorInput,
  ownerId?: string | null
): string => {
  if (input.fingerprint && input.fingerprint.trim()) {
    return `custom:${ownerId || 'shared'}:${input.fingerprint.trim()}`;
  }

  const errorType = (input.errorType || '').trim();
  const frames = extractStackFrames(input.stackTrace);
  const message = (input.message || '').trim();

  // Prefer stack frames for grouping; fall back to the message when the
  // reporter did not include a stack trace.
  const basis = frames.length > 0 ? frames.join('|') : message;

  // The owner is part of the fingerprint so two accounts reporting the same
  // defect keep their own counters.
  const hash = crypto
    .createHash('sha256')
    .update(`${ownerId || 'shared'}::${errorType}::${basis}`)
    .digest('hex')
    .slice(0, 32);

  return `auto:${hash}`;
};

/**
 * Resolves the project an error belongs to.
 */
const resolveProjectId = async (
  projectId: string | null | undefined,
  repository: string | null | undefined,
  ownerId?: string | null
): Promise<string | null> => {
  if (projectId) {
    const found = await query<{ id: string }>(
      `SELECT id FROM projects
       WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL);`,
      [projectId, ownerId ?? null]
    );
    return found.rows[0]?.id ?? null;
  }

  if (repository) {
    const normalized = repository.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    const found = await query<{ id: string }>(
      `SELECT id FROM projects
       WHERE LOWER(provider) = 'github' AND LOWER(repository) = LOWER($1)
         AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL)
       LIMIT 1;`,
      [normalized, ownerId ?? null]
    );
    return found.rows[0]?.id ?? null;
  }

  return null;
};

/**
 * Records a runtime error, creating it on first sight and incrementing the
 * occurrence counter on subsequent reports of the same fingerprint.
 */
export const recordApplicationError = async (
  input: ApplicationErrorInput,
  ownerId?: string | null
): Promise<{ record: ApplicationErrorRecord; created: boolean }> => {
  const fingerprint = computeFingerprint(input, ownerId);
  const projectId = await resolveProjectId(input.projectId, input.repository, ownerId);

  const existing = await query<ApplicationErrorRecord>(
    `SELECT * FROM application_errors WHERE fingerprint = $1;`,
    [fingerprint]
  );

  if (existing.rows.length > 0) {
    const current = existing.rows[0];
    const updated = await query<ApplicationErrorRecord>(
      `UPDATE application_errors
       SET occurrence_count = occurrence_count + 1,
           last_seen_at = NOW(),
           affected_users = COALESCE($1, affected_users),
           project_id = COALESCE(project_id, $2),
           context = COALESCE($3, context),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *;`,
      [input.affectedUsers ?? null, projectId, input.context ? JSON.stringify(input.context) : null, current.id]
    );

    const record = updated.rows[0];
    publish('error.updated', { id: record.id, fingerprint, occurrenceCount: record.occurrence_count });
    return { record, created: false };
  }

  const inserted = await query<ApplicationErrorRecord>(
    `INSERT INTO application_errors (
       project_id, repository_name, environment, service, error_type, message,
       stack_trace, fingerprint, occurrence_count, affected_users, release_version,
       source_url, status, context, owner_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, 'OPEN', $12, $13)
     RETURNING *;`,
    [
      projectId,
      input.repository?.trim() || null,
      input.environment?.trim() || null,
      input.service?.trim() || null,
      input.errorType?.trim() || null,
      input.message.trim(),
      input.stackTrace ?? null,
      fingerprint,
      input.affectedUsers ?? null,
      input.release?.trim() || null,
      input.url?.trim() || null,
      input.context ? JSON.stringify(input.context) : null,
      ownerId ?? null,
    ]
  );

  const record = inserted.rows[0];
  
  // Enrich with severity/category
  try {
    const category = classifyCategory({ source: 'runtime', service: record.service, environment: record.environment, repository: record.repository_name, errorMessage: record.message });
    const severity = classifySeverity({ source: 'runtime', service: record.service, environment: record.environment, repository: record.repository_name, errorMessage: record.message, errorType: record.error_type, category });
    await query(`UPDATE application_errors SET severity = $1, category = $2 WHERE id = $3`, [severity, category, record.id]);
    (record as any).severity = severity;
    (record as any).category = category;
  } catch {}
  
  publish('error.created', {
    id: record.id,
    fingerprint,
    message: record.message,
    errorType: record.error_type,
    repositoryName: record.repository_name,
    service: record.service,
  });
  
  // Dispatch notification for runtime errors too
  try {
    await dispatchNotification({
      applicationErrorId: record.id,
      title: record.message,
      severity: (record as any).severity || 'medium',
      category: (record as any).category,
      service: record.service || record.repository_name,
      environment: record.environment,
      repository: record.repository_name,
      source: 'runtime',
      status: record.status,
      createdAt: record.created_at
    });
  } catch (e) {
    console.error('Notification dispatch failed for runtime error:', (e as Error).message);
  }
  
  return { record, created: true };
};

/**
 * Lists runtime errors, newest first.
 */
export const listApplicationErrors = async (filters: {
  status?: string;
  projectId?: string;
  repository?: string;
  ownerId?: string | null;
} = {}): Promise<ApplicationErrorRecord[]> => {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  // Errors reported without an account stay shared, everything else belongs
  // to the account that reported it.
  if (filters.ownerId !== undefined) {
    conditions.push(`(owner_id = $${idx++} OR owner_id IS NULL)`);
    values.push(filters.ownerId);
  }

  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    values.push(filters.status.toUpperCase());
  }
  if (filters.projectId) {
    conditions.push(`project_id = $${idx++}`);
    values.push(filters.projectId);
  }
  if (filters.repository) {
    conditions.push(`repository_name ILIKE $${idx++}`);
    values.push(`%${filters.repository}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query<ApplicationErrorRecord>(
    `SELECT * FROM application_errors
     ${whereClause}
     ORDER BY last_seen_at DESC;`,
    values
  );
  return result.rows;
};

/**
 * Fetches a single runtime error.
 */
export const findApplicationErrorById = async (
  id: string,
  ownerId?: string | null
): Promise<ApplicationErrorRecord | null> => {
  const result = await query<ApplicationErrorRecord>(
    `SELECT * FROM application_errors
     WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL);`,
    [id, ownerId ?? null]
  );
  return result.rows[0] || null;
};

/**
 * Marks a runtime error as resolved.
 */
export const resolveApplicationError = async (
  id: string,
  ownerId?: string | null
): Promise<ApplicationErrorRecord | null> => {
  const result = await query<ApplicationErrorRecord>(
    `UPDATE application_errors
     SET status = 'RESOLVED', updated_at = NOW()
     WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL)
     RETURNING *;`,
    [id, ownerId ?? null]
  );

  const record = result.rows[0] || null;
  if (record) {
    publish('error.resolved', { id: record.id, status: record.status });
  }
  return record;
};
