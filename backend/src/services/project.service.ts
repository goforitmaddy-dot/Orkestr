import { query } from '../db';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export const findAllProjects = async (): Promise<Project[]> => {
  const sql = `
    SELECT id, name, description, created_at, updated_at
    FROM projects
    ORDER BY created_at DESC;
  `;
  const result = await query<Project>(sql);
  return result.rows;
};

export const findProjectById = async (id: string): Promise<Project | null> => {
  const sql = `
    SELECT id, name, description, created_at, updated_at
    FROM projects
    WHERE id = $1;
  `;
  const result = await query<Project>(sql, [id]);
  return result.rows[0] || null;
};

export const createProject = async (data: CreateProjectInput): Promise<Project> => {
  const sql = `
    INSERT INTO projects (name, description)
    VALUES ($1, $2)
    RETURNING id, name, description, created_at, updated_at;
  `;
  const result = await query<Project>(sql, [data.name.trim(), data.description ? data.description.trim() : null]);
  return result.rows[0];
};

export const updateProject = async (
  id: string,
  data: UpdateProjectInput
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

  if (fields.length === 0) {
    // If no fields to update, return the current project
    return findProjectById(id);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const sql = `
    UPDATE projects
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, name, description, created_at, updated_at;
  `;

  const result = await query<Project>(sql, values);
  return result.rows[0] || null;
};

export const deleteProject = async (id: string): Promise<boolean> => {
  const sql = `
    DELETE FROM projects
    WHERE id = $1
    RETURNING id;
  `;
  const result = await query(sql, [id]);
  return (result.rowCount ?? 0) > 0;
};
