import { query } from '../db';
import { AppError } from '../middleware/errorHandler';

export type ProjectMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface ProjectMemberWithUser {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  user_name: string;
  user_username?: string;
  user_email: string;
  user_skills: string[];
  weekly_capacity_hours: number;
  is_available: boolean;
  created_at: string;
}

export interface AddProjectMemberInput {
  userId?: string;
  username?: string;
  name?: string;
  email?: string;
  role?: ProjectMemberRole;
  skills?: string[];
  weeklyCapacityHours?: number;
  isAvailable?: boolean;
}

export const findProjectMembers = async (
  projectId: string
): Promise<ProjectMemberWithUser[]> => {
  const sql = `
    SELECT 
      pm.id,
      pm.project_id,
      pm.user_id,
      pm.role,
      pm.created_at,
      u.name as user_name,
      u.username as user_username,
      u.email as user_email,
      COALESCE(u.skills, '{}') as user_skills,
      COALESCE(u.weekly_capacity_hours, 40) as weekly_capacity_hours,
      COALESCE(u.is_available, true) as is_available
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = $1
    ORDER BY u.name ASC;
  `;
  const result = await query<ProjectMemberWithUser>(sql, [projectId]);
  return result.rows;
};

export const addProjectMember = async (
  projectId: string,
  input: AddProjectMemberInput
): Promise<ProjectMemberWithUser> => {
  let targetUserId = input.userId;

  if (targetUserId) {
    // Verify targetUserId exists and is a registered Orkestr account
    const userRes = await query<{ id: string; password_hash: string | null }>(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [targetUserId]
    );
    if (userRes.rows.length === 0) {
      throw new AppError(
        'User not found on Orkestr. Only registered Orkestr teammates can be added to projects.',
        404
      );
    }
    if (!userRes.rows[0].password_hash) {
      throw new AppError(
        'User is not registered on Orkestr. Only registered Orkestr accounts can be added to projects.',
        400
      );
    }
  } else {
    const identifier = (input.username || input.email || '').trim().toLowerCase();
    if (!identifier) {
      throw new AppError('Either userId, username, or email must be provided', 400);
    }

    // Find registered user by username or email
    const userRes = await query<{ id: string; password_hash: string | null }>(
      'SELECT id, password_hash FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $1',
      [identifier]
    );

    if (userRes.rows.length === 0) {
      throw new AppError(
        'User not found on Orkestr. Only registered Orkestr teammates can be added to projects.',
        404
      );
    }

    if (!userRes.rows[0].password_hash) {
      throw new AppError(
        'User is not registered on Orkestr. Only registered Orkestr accounts can be added to projects.',
        400
      );
    }

    targetUserId = userRes.rows[0].id;
  }

  // Check if already a member of this project
  const memberCheck = await query(
    'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, targetUserId]
  );

  if (memberCheck.rows.length > 0) {
    throw new AppError('User is already a member of this project', 409);
  }

  const role = input.role || 'MEMBER';
  await query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, $3)`,
    [projectId, targetUserId, role]
  );

  // If skills or capacity attributes were specified when adding member, persist to user profile
  if (
    (input.skills && input.skills.length > 0) ||
    input.weeklyCapacityHours !== undefined ||
    input.isAvailable !== undefined
  ) {
    await query(
      `UPDATE users
       SET skills = CASE WHEN $1::text[] IS NOT NULL THEN $1 ELSE skills END,
           weekly_capacity_hours = CASE WHEN $2::int IS NOT NULL THEN $2 ELSE weekly_capacity_hours END,
           is_available = CASE WHEN $3::boolean IS NOT NULL THEN $3 ELSE is_available END
       WHERE id = $4`,
      [
        input.skills && input.skills.length > 0 ? input.skills : null,
        input.weeklyCapacityHours ?? null,
        input.isAvailable ?? null,
        targetUserId,
      ]
    );
  }

  // Return the created member with user details
  const members = await findProjectMembers(projectId);
  const createdMember = members.find((m) => m.user_id === targetUserId);
  if (!createdMember) {
    throw new AppError('Failed to retrieve created project member', 500);
  }

  return createdMember;
};

export const removeProjectMember = async (
  projectId: string,
  userId: string
): Promise<void> => {
  const res = await query(
    'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING id',
    [projectId, userId]
  );

  if (res.rowCount === 0) {
    throw new AppError('Member not found in project', 404);
  }

  // Unassign tasks assigned to this user in this project
  await query(
    'UPDATE tasks SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = $2',
    [projectId, userId]
  );
};

export const findAllUsers = async (): Promise<Array<{
  id: string;
  name: string;
  username: string;
  email: string;
  skills: string[];
  weekly_capacity_hours: number;
  is_available: boolean;
}>> => {
  const result = await query<{
    id: string;
    name: string;
    username: string;
    email: string;
    skills: string[];
    weekly_capacity_hours: number;
    is_available: boolean;
  }>(`
    SELECT id, name, COALESCE(username, LOWER(REGEXP_REPLACE(name, '\\s+', '_', 'g'))) as username, email, skills, weekly_capacity_hours, is_available
    FROM users
    WHERE password_hash IS NOT NULL
    ORDER BY name ASC;
  `);
  return result.rows;
};

export const findAuthorizedUsers = async (
  currentUserId: string,
  search?: string,
  all?: boolean
): Promise<Array<{
  id: string;
  name: string;
  username: string;
  email: string;
  skills: string[];
  weekly_capacity_hours: number;
  is_available: boolean;
}>> => {
  if (all) {
    const result = await query<{
      id: string;
      name: string;
      username: string;
      email: string;
      skills: string[];
      weekly_capacity_hours: number;
      is_available: boolean;
    }>(
      `SELECT id, name, COALESCE(username, LOWER(REGEXP_REPLACE(name, '\\s+', '_', 'g'))) as username, email, skills, weekly_capacity_hours, is_available
       FROM users
       WHERE password_hash IS NOT NULL
       ORDER BY name ASC
       LIMIT 50`
    );
    return result.rows;
  }

  if (search) {
    const result = await query<{
      id: string;
      name: string;
      username: string;
      email: string;
      skills: string[];
      weekly_capacity_hours: number;
      is_available: boolean;
    }>(
      `SELECT id, name, COALESCE(username, LOWER(REGEXP_REPLACE(name, '\\s+', '_', 'g'))) as username, email, skills, weekly_capacity_hours, is_available
       FROM users
       WHERE password_hash IS NOT NULL
         AND (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(username) LIKE $1)
       ORDER BY name ASC
       LIMIT 30`,
      [`%${search.toLowerCase()}%`]
    );
    return result.rows;
  }

  // Default: collaborator isolation - only return teammates who share projects with current user, or current user
  const result = await query<{
    id: string;
    name: string;
    username: string;
    email: string;
    skills: string[];
    weekly_capacity_hours: number;
    is_available: boolean;
  }>(
    `SELECT DISTINCT u.id, u.name, COALESCE(u.username, LOWER(REGEXP_REPLACE(u.name, '\\s+', '_', 'g'))) as username, u.email, u.skills, u.weekly_capacity_hours, u.is_available
     FROM users u
     WHERE u.password_hash IS NOT NULL
       AND (
         u.id = $1
         OR u.id IN (
           SELECT pm2.user_id
           FROM project_members pm1
           JOIN project_members pm2 ON pm1.project_id = pm2.project_id
           WHERE pm1.user_id = $1
         )
       )
     ORDER BY u.name ASC`,
    [currentUserId]
  );
  return result.rows;
};

