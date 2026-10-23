import { query } from '../db';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  repository: string | null;
  server_url: string | null;
  monitoring_enabled: boolean;
  last_polled_at: string | null;
  last_poll_error: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  provider?: string | null;
  repository?: string | null;
  serverUrl?: string | null;
  monitoringEnabled?: boolean | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  provider?: string | null;
  repository?: string | null;
  serverUrl?: string | null;
  monitoringEnabled?: boolean | null;
}

const PROJECT_COLUMNS = `id, name, description, provider, repository, server_url,
  monitoring_enabled, last_polled_at, last_poll_error, owner_id, created_at, updated_at`;

/**
 * Normalises a repository reference into the canonical `owner/repo` form.
 */
export const normalizeRepository = (repository: string | null | undefined): string | null => {
  if (!repository) return null;
  const trimmed = repository
    .trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '');
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Projects belong to the account that created them.
 *
 * Projects created before accounts existed have no owner; they stay visible
 * so existing work is not lost, but every new project is scoped to its owner.
 */
const OWNER_FILTER = 'WHERE owner_id = $1 OR owner_id IS NULL';

export const findAllProjects = async (ownerId?: string): Promise<Project[]> => {
  const sql = ownerId
    ? `
      SELECT ${PROJECT_COLUMNS}
      FROM projects
      ${OWNER_FILTER}
      ORDER BY created_at DESC;
    `
    : `
      SELECT ${PROJECT_COLUMNS}
      FROM projects
      ORDER BY created_at DESC;
    `;
  const result = ownerId
    ? await query<Project>(sql, [ownerId])
    : await query<Project>(sql);
  return result.rows;
};

export const findProjectById = async (
  id: string,
  ownerId?: string
): Promise<Project | null> => {
  const sql = ownerId
    ? `
      SELECT ${PROJECT_COLUMNS}
      FROM projects
      WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL);
    `
    : `
      SELECT ${PROJECT_COLUMNS}
      FROM projects
      WHERE id = $1;
    `;
  const result = ownerId
    ? await query<Project>(sql, [id, ownerId])
    : await query<Project>(sql, [id]);
  return result.rows[0] || null;
};

export const createProject = async (
  data: CreateProjectInput,
  ownerId?: string | null
): Promise<Project> => {
  const sql = `
    INSERT INTO projects (name, description, provider, repository, server_url, monitoring_enabled, owner_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING ${PROJECT_COLUMNS};
  `;
  const result = await query<Project>(sql, [
    data.name.trim(),
    data.description ? data.description.trim() : null,
    data.provider?.trim() || 'github',
    normalizeRepository(data.repository),
    data.serverUrl ? data.serverUrl.trim() : null,
    data.monitoringEnabled ?? false,
    ownerId ?? null,
  ]);
  return result.rows[0];
};

export const updateProject = async (
  id: string,
  data: UpdateProjectInput,
  ownerId?: string
): Promise<Project | null> => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(data.name.trim());
  }

  if (data.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(data.description ? data.description.trim() : null);
  }

  if (data.provider !== undefined) {
    fields.push(`provider = $${paramIndex++}`);
    values.push(data.provider?.trim() || 'github');
  }

  if (data.repository !== undefined) {
    fields.push(`repository = $${paramIndex++}`);
    values.push(normalizeRepository(data.repository));
  }

  if (data.serverUrl !== undefined) {
    fields.push(`server_url = $${paramIndex++}`);
    values.push(data.serverUrl ? data.serverUrl.trim() : null);
  }

  if (data.monitoringEnabled !== undefined) {
    fields.push(`monitoring_enabled = $${paramIndex++}`);
    values.push(data.monitoringEnabled);
  }

  if (fields.length === 0) {
    // If no fields to update, return the current project
    return findProjectById(id, ownerId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const sql = ownerId
    ? `
      UPDATE projects
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex} AND (owner_id = $${paramIndex + 1} OR owner_id IS NULL)
      RETURNING ${PROJECT_COLUMNS};
    `
    : `
      UPDATE projects
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING ${PROJECT_COLUMNS};
    `;

  const result = ownerId
    ? await query<Project>(sql, [...values, ownerId])
    : await query<Project>(sql, values);
  return result.rows[0] || null;
};

export const deleteProject = async (id: string, ownerId?: string): Promise<boolean> => {
  const sql = ownerId
    ? `
      DELETE FROM projects
      WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL)
      RETURNING id;
    `
    : `
      DELETE FROM projects
      WHERE id = $1
      RETURNING id;
    `;
  const result = ownerId
    ? await query(sql, [id, ownerId])
    : await query(sql, [id]);
  return (result.rowCount ?? 0) > 0;
};
