import { query } from '../db';
import { QueryResult } from 'pg';
import { AppError } from '../middleware/errorHandler';
import { ProjectRole } from '../types/auth';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface UpdateTaskOptions {
  userRole?: ProjectRole;
  userId?: string;
  systemOverride?: boolean;
  isReviewApproval?: boolean;
}

export function validateTaskStatusTransition(
  currentStatus: TaskStatus,
  newStatus: TaskStatus,
  options?: UpdateTaskOptions,
  assigneeId?: string | null
): void {
  // If no change, allowed
  if (currentStatus === newStatus) {
    return;
  }

  // System override (AI verification engine or internal workflow)
  if (options?.systemOverride || !options?.userRole) {
    return;
  }

  const role = options?.userRole;
  const isOwnerOrAdmin = role === 'OWNER' || role === 'ADMIN';
  const isAssignee = Boolean(options?.userId && assigneeId && options.userId === assigneeId);

  // 1. Ordinary members cannot mark tasks DONE or CHANGES_REQUESTED directly
  if (role === 'MEMBER') {
    if (newStatus === 'DONE') {
      throw new AppError(
        'Access denied: Members cannot mark tasks as DONE. Submit the task for verification to have it reviewed and approved.',
        403
      );
    }
    if (newStatus === 'CHANGES_REQUESTED') {
      throw new AppError(
        'Access denied: Status CHANGES_REQUESTED can only be set through verification or human review.',
        403
      );
    }
  }

  // 2. Direct updates to IN_REVIEW via PATCH are prohibited (must use explicit verification submission)
  if (newStatus === 'IN_REVIEW') {
    throw new AppError(
      "Invalid task status transition: Tasks cannot be directly updated to IN_REVIEW. Use 'Submit for Verification' to verify work against GitHub changes.",
      400
    );
  }

  // 3. State transition rules
  switch (currentStatus) {
    case 'TODO':
      if (newStatus === 'IN_PROGRESS') {
        if (!isAssignee && !isOwnerOrAdmin) {
          throw new AppError(
            'Access denied: Only the assigned developer or project owners/admins can start this task.',
            403
          );
        }
        return;
      }
      throw new AppError(
        `Invalid task status transition from TODO to ${newStatus}. A task must be started (IN_PROGRESS) before submitting for verification or completion.`,
        400
      );

    case 'IN_PROGRESS':
      if (newStatus === 'DONE') {
        throw new AppError(
          'Invalid task status transition: Tasks in IN_PROGRESS must be submitted for verification and approved before moving to DONE.',
          400
        );
      }
      if (newStatus === 'CHANGES_REQUESTED') {
        throw new AppError(
          'Invalid task status transition: Tasks cannot move directly from IN_PROGRESS to CHANGES_REQUESTED without verification or review.',
          400
        );
      }
      if (newStatus === 'TODO') {
        if (!isOwnerOrAdmin) {
          throw new AppError(
            'Access denied: Only project owners and admins can reset an in-progress task back to TODO.',
            403
          );
        }
        return;
      }
      throw new AppError(
        `Invalid task status transition from IN_PROGRESS to ${newStatus}.`,
        400
      );

    case 'IN_REVIEW':
      if (newStatus === 'DONE') {
        if (!isOwnerOrAdmin) {
          throw new AppError(
            'Access denied: Only project owners and admins can approve tasks to DONE.',
            403
          );
        }
        return;
      }
      if (newStatus === 'CHANGES_REQUESTED') {
        if (!isOwnerOrAdmin) {
          throw new AppError(
            'Access denied: Only project owners and admins can request changes on a task.',
            403
          );
        }
        return;
      }
      if (newStatus === 'IN_PROGRESS') {
        if (!isOwnerOrAdmin) {
          throw new AppError(
            'Access denied: Only project owners and admins can return a task from IN_REVIEW to IN_PROGRESS.',
            403
          );
        }
        return;
      }
      throw new AppError(
        `Invalid task status transition from IN_REVIEW to ${newStatus}.`,
        400
      );

    case 'CHANGES_REQUESTED':
      if (newStatus === 'IN_PROGRESS') {
        if (!isAssignee && !isOwnerOrAdmin) {
          throw new AppError(
            'Access denied: Only the assigned developer or project owners/admins can resume work on this task.',
            403
          );
        }
        return;
      }
      throw new AppError(
        `Invalid task status transition from CHANGES_REQUESTED to ${newStatus}. Developers must resume work (IN_PROGRESS) and address changes before resubmitting.`,
        400
      );

    case 'DONE':
      if (newStatus === 'IN_PROGRESS' || newStatus === 'TODO') {
        if (!isOwnerOrAdmin) {
          throw new AppError(
            'Access denied: Only project owners and admins can reopen a completed task.',
            403
          );
        }
        return;
      }
      throw new AppError(
        `Invalid task status transition from DONE to ${newStatus}. Completed tasks cannot be modified directly.`,
        400
      );

    default:
      throw new AppError(
        `Invalid task status transition from ${currentStatus} to ${newStatus}.`,
        400
      );
  }
}

export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  acceptance_criteria?: string[];
  status: TaskStatus;
  priority: TaskPriority;
  estimated_hours: number | null;
  required_skills: string[];
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  task_number: number;
  created_at: string;
  updated_at: string;
}

export interface TaskWithDependencies extends Task {
  depends_on: Array<{ id: string; title: string; status: TaskStatus }>;
  dependent_tasks: Array<{ id: string; title: string; status: TaskStatus }>;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string | null;
  acceptanceCriteria?: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number | null;
  requiredSkills?: string[];
  assigneeId?: string | null;
  parentTaskId?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  acceptanceCriteria?: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number | null;
  requiredSkills?: string[];
  assigneeId?: string | null;
  parentTaskId?: string | null;
}

export interface TaskFilterOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
}

export const findTasksByProjectId = async (
  projectId: string,
  filters: TaskFilterOptions = {}
): Promise<Task[]> => {
  const conditions: string[] = ['t.project_id = $1'];
  const values: unknown[] = [projectId];
  let paramIndex = 2;

  if (filters.status) {
    conditions.push(`t.status = $${paramIndex++}`);
    values.push(filters.status);
  }

  if (filters.priority) {
    conditions.push(`t.priority = $${paramIndex++}`);
    values.push(filters.priority);
  }

  if (filters.assigneeId) {
    conditions.push(`t.assignee_id = $${paramIndex++}`);
    values.push(filters.assigneeId);
  }

  const sql = `
    SELECT 
      t.id,
      t.project_id,
      t.parent_task_id,
      t.title,
      t.description,
      COALESCE(t.acceptance_criteria, '{}') as acceptance_criteria,
      t.status,
      t.priority,
      t.estimated_hours::float as estimated_hours,
      COALESCE(t.required_skills, '{}') as required_skills,
      t.assignee_id,
      u.name as assignee_name,
      u.email as assignee_email,
      t.task_number,
      t.created_at,
      t.updated_at
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.created_at ASC;
  `;

  const result = await query<Task>(sql, values);
  return result.rows;
};

export const findTaskById = async (taskId: string): Promise<Task | null> => {
  const sql = `
    SELECT 
      t.id,
      t.project_id,
      t.parent_task_id,
      t.title,
      t.description,
      COALESCE(t.acceptance_criteria, '{}') as acceptance_criteria,
      t.status,
      t.priority,
      t.estimated_hours::float as estimated_hours,
      COALESCE(t.required_skills, '{}') as required_skills,
      t.assignee_id,
      u.name as assignee_name,
      u.email as assignee_email,
      t.task_number,
      t.created_at,
      t.updated_at
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.id = $1;
  `;
  const result = await query<Task>(sql, [taskId]);
  return result.rows[0] || null;
};

export const findTaskWithDependencies = async (
  taskId: string
): Promise<TaskWithDependencies | null> => {
  const task = await findTaskById(taskId);
  if (!task) return null;

  // Find tasks that this task depends on
  const dependsOnSql = `
    SELECT t.id, t.title, t.status
    FROM task_dependencies td
    JOIN tasks t ON td.depends_on_task_id = t.id
    WHERE td.task_id = $1
    ORDER BY t.title ASC;
  `;
  const dependsOnRes = await query<{ id: string; title: string; status: TaskStatus }>(
    dependsOnSql,
    [taskId]
  );

  // Find tasks that depend on this task
  const dependentSql = `
    SELECT t.id, t.title, t.status
    FROM task_dependencies td
    JOIN tasks t ON td.task_id = t.id
    WHERE td.depends_on_task_id = $1
    ORDER BY t.title ASC;
  `;
  const dependentRes = await query<{ id: string; title: string; status: TaskStatus }>(
    dependentSql,
    [taskId]
  );

  return {
    ...task,
    depends_on: dependsOnRes.rows,
    dependent_tasks: dependentRes.rows,
  };
};

export const createTask = async (data: CreateTaskInput): Promise<Task> => {
  const sql = `
    INSERT INTO tasks (
      project_id,
      parent_task_id,
      title,
      description,
      acceptance_criteria,
      status,
      priority,
      estimated_hours,
      required_skills,
      assignee_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING 
      id,
      project_id,
      parent_task_id,
      title,
      description,
      COALESCE(acceptance_criteria, '{}') as acceptance_criteria,
      status,
      priority,
      estimated_hours::float as estimated_hours,
      COALESCE(required_skills, '{}') as required_skills,
      assignee_id,
      task_number,
      created_at,
      updated_at;
  `;

  const values = [
    data.projectId,
    data.parentTaskId || null,
    data.title.trim(),
    data.description ? data.description.trim() : null,
    data.acceptanceCriteria || [],
    data.status || 'TODO',
    data.priority || 'MEDIUM',
    data.estimatedHours || null,
    data.requiredSkills || [],
    data.assigneeId || null,
  ];

  const result = await query<Task>(sql, values);
  return result.rows[0];
};

export const updateTask = async (
  taskId: string,
  data: UpdateTaskInput,
  options?: UpdateTaskOptions
): Promise<Task | null> => {
  const currentTask = await findTaskById(taskId);
  if (!currentTask) {
    return null;
  }

  if (data.status !== undefined && data.status !== currentTask.status) {
    validateTaskStatusTransition(
      currentTask.status,
      data.status,
      options,
      currentTask.assignee_id
    );
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(data.title.trim());
  }

  if (data.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(data.description ? data.description.trim() : null);
  }

  if (data.acceptanceCriteria !== undefined) {
    fields.push(`acceptance_criteria = $${paramIndex++}`);
    values.push(data.acceptanceCriteria);
  }

  if (data.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(data.status);
  }

  if (data.priority !== undefined) {
    fields.push(`priority = $${paramIndex++}`);
    values.push(data.priority);
  }

  if (data.estimatedHours !== undefined) {
    fields.push(`estimated_hours = $${paramIndex++}`);
    values.push(data.estimatedHours);
  }

  if (data.requiredSkills !== undefined) {
    fields.push(`required_skills = $${paramIndex++}`);
    values.push(data.requiredSkills);
  }

  if (data.assigneeId !== undefined) {
    fields.push(`assignee_id = $${paramIndex++}`);
    values.push(data.assigneeId);
  }

  if (data.parentTaskId !== undefined) {
    fields.push(`parent_task_id = $${paramIndex++}`);
    values.push(data.parentTaskId);
  }

  if (fields.length === 0) {
    return findTaskById(taskId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(taskId);

  const sql = `
    UPDATE tasks
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING 
      id,
      project_id,
      parent_task_id,
      title,
      description,
      COALESCE(acceptance_criteria, '{}') as acceptance_criteria,
      status,
      priority,
      estimated_hours::float as estimated_hours,
      assignee_id,
      task_number,
      COALESCE(required_skills, '{}') as required_skills,
      created_at,
      updated_at;
  `;

  const result = await query<Task>(sql, values);
  return result.rows[0] || null;
};

export const deleteTask = async (taskId: string): Promise<boolean> => {
  const sql = `
    DELETE FROM tasks
    WHERE id = $1
    RETURNING id;
  `;
  const result = await query(sql, [taskId]);
  return (result.rowCount ?? 0) > 0;
};

// Dependency Queries
export const findDependenciesByTaskId = async (
  taskId: string
): Promise<{
  dependsOn: Array<{ id: string; title: string; status: TaskStatus; priority: TaskPriority }>;
  dependentTasks: Array<{ id: string; title: string; status: TaskStatus; priority: TaskPriority }>;
}> => {
  const dependsOnSql = `
    SELECT t.id, t.title, t.status, t.priority
    FROM task_dependencies td
    JOIN tasks t ON td.depends_on_task_id = t.id
    WHERE td.task_id = $1
    ORDER BY t.title ASC;
  `;

  const dependentTasksSql = `
    SELECT t.id, t.title, t.status, t.priority
    FROM task_dependencies td
    JOIN tasks t ON td.task_id = t.id
    WHERE td.depends_on_task_id = $1
    ORDER BY t.title ASC;
  `;

  const [dependsOnRes, dependentRes] = await Promise.all([
    query<{ id: string; title: string; status: TaskStatus; priority: TaskPriority }>(dependsOnSql, [taskId]),
    query<{ id: string; title: string; status: TaskStatus; priority: TaskPriority }>(dependentTasksSql, [taskId]),
  ]);

  return {
    dependsOn: dependsOnRes.rows,
    dependentTasks: dependentRes.rows,
  };
};

/**
 * Cycle detection for task dependencies:
 * Checks whether task `fromTaskId` can reach `targetTaskId` by following existing dependencies.
 * If targetTaskId is reachable from fromTaskId, adding targetTaskId -> fromTaskId would form a cycle.
 */
export const wouldCreateDependencyCycle = async (
  taskId: string,
  dependsOnTaskId: string
): Promise<boolean> => {
  // If task A depends on B, check if B already depends on A directly or indirectly
  const visited = new Set<string>();
  const queue = [dependsOnTaskId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === taskId) {
      return true;
    }

    if (!visited.has(current)) {
      visited.add(current);
      const res = await query<{ depends_on_task_id: string }>(
        'SELECT depends_on_task_id FROM task_dependencies WHERE task_id = $1',
        [current]
      );
      for (const row of res.rows) {
        if (!visited.has(row.depends_on_task_id)) {
          queue.push(row.depends_on_task_id);
        }
      }
    }
  }

  return false;
};

/**
 * Cycle detection for parent tasks:
 * Checks whether making `parentTaskId` the parent of `taskId` would create a parent-child cycle.
 */
export const wouldCreateParentCycle = async (
  taskId: string,
  parentTaskId: string
): Promise<boolean> => {
  let currentParentId: string | null = parentTaskId;
  const visited = new Set<string>();

  while (currentParentId) {
    if (currentParentId === taskId) {
      return true;
    }
    if (visited.has(currentParentId)) {
      break;
    }
    visited.add(currentParentId);

    const parentRes: QueryResult<{ parent_task_id: string | null }> =
      await query<{ parent_task_id: string | null }>(
        'SELECT parent_task_id FROM tasks WHERE id = $1',
        [currentParentId]
      );
    currentParentId = parentRes.rows[0]?.parent_task_id || null;
  }

  return false;
};

export const checkDependencyExists = async (
  taskId: string,
  dependsOnTaskId: string
): Promise<boolean> => {
  const sql = `
    SELECT 1 FROM task_dependencies
    WHERE task_id = $1 AND depends_on_task_id = $2;
  `;
  const result = await query(sql, [taskId, dependsOnTaskId]);
  return (result.rowCount ?? 0) > 0;
};

export const createDependency = async (
  taskId: string,
  dependsOnTaskId: string
): Promise<{ task_id: string; depends_on_task_id: string; created_at: string }> => {
  const sql = `
    INSERT INTO task_dependencies (task_id, depends_on_task_id)
    VALUES ($1, $2)
    RETURNING task_id, depends_on_task_id, created_at;
  `;
  const result = await query<{ task_id: string; depends_on_task_id: string; created_at: string }>(
    sql,
    [taskId, dependsOnTaskId]
  );
  return result.rows[0];
};

export const deleteDependency = async (
  taskId: string,
  dependsOnTaskId: string
): Promise<boolean> => {
  const sql = `
    DELETE FROM task_dependencies
    WHERE task_id = $1 AND depends_on_task_id = $2
    RETURNING task_id;
  `;
  const result = await query(sql, [taskId, dependsOnTaskId]);
  return (result.rowCount ?? 0) > 0;
};

// User lookup helper for assignee validation
export const findUserById = async (userId: string): Promise<boolean> => {
  const sql = 'SELECT 1 FROM users WHERE id = $1;';
  const result = await query(sql, [userId]);
  return (result.rowCount ?? 0) > 0;
};

export const findRegisteredProjectMember = async (
  projectId: string,
  userId: string
): Promise<{ exists: boolean; isRegistered: boolean; isMember: boolean }> => {
  const sql = `
    SELECT 
      u.id,
      (u.password_hash IS NOT NULL) AS is_registered,
      EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.user_id = u.id) AS is_member
    FROM users u
    WHERE u.id = $2;
  `;
  const result = await query<{ id: string; is_registered: boolean; is_member: boolean }>(sql, [
    projectId,
    userId,
  ]);
  if (result.rows.length === 0) {
    return { exists: false, isRegistered: false, isMember: false };
  }
  return {
    exists: true,
    isRegistered: Boolean(result.rows[0].is_registered),
    isMember: Boolean(result.rows[0].is_member),
  };
};

export interface TaskDependencySummary {
  id: string;
  title: string;
  status: TaskStatus;
  is_completed: boolean;
}

export interface PersonalTask {
  id: string;
  project_id: string;
  project_name: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimated_hours: number | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  dependencies: TaskDependencySummary[];
  is_blocked: boolean;
  task_number?: number;
  created_at: string;
  updated_at: string;
}

export const findTasksForUser = async (
  userId: string,
  scope: 'assigned' | 'all' | 'unassigned' = 'assigned'
): Promise<PersonalTask[]> => {
  let whereClause = 't.assignee_id = $1';
  if (scope === 'all') {
    whereClause = 'TRUE';
  } else if (scope === 'unassigned') {
    whereClause = 't.assignee_id IS NULL';
  }

  const sql = `
    SELECT 
      t.id,
      t.project_id,
      p.name AS project_name,
      t.parent_task_id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.estimated_hours::float AS estimated_hours,
      t.assignee_id,
      u.name AS assignee_name,
      u.email AS assignee_email,
      t.task_number,
      t.created_at,
      t.updated_at,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', dep_t.id,
              'title', dep_t.title,
              'status', dep_t.status,
              'is_completed', (dep_t.status = 'DONE')
            ) ORDER BY dep_t.title ASC
          )
          FROM task_dependencies td
          JOIN tasks dep_t ON td.depends_on_task_id = dep_t.id
          WHERE td.task_id = t.id
        ),
        '[]'::json
      ) AS dependencies,
      COALESCE(
        (
          SELECT bool_or(dep_t.status != 'DONE')
          FROM task_dependencies td
          JOIN tasks dep_t ON td.depends_on_task_id = dep_t.id
          WHERE td.task_id = t.id
        ),
        false
      ) AND (t.status != 'DONE') AS is_blocked
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $1
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE ${whereClause}
    ORDER BY 
      CASE t.priority
        WHEN 'URGENT' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
        ELSE 5
      END,
      t.created_at DESC;
  `;

  const result = await query<PersonalTask>(sql, [userId]);
  return result.rows;
};
