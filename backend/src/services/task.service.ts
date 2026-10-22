import { query } from '../db';
import { QueryResult } from 'pg';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimated_hours: number | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
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
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number | null;
  assigneeId?: string | null;
  parentTaskId?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number | null;
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
      t.status,
      t.priority,
      t.estimated_hours::float as estimated_hours,
      t.assignee_id,
      u.name as assignee_name,
      u.email as assignee_email,
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
      t.status,
      t.priority,
      t.estimated_hours::float as estimated_hours,
      t.assignee_id,
      u.name as assignee_name,
      u.email as assignee_email,
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
      status,
      priority,
      estimated_hours,
      assignee_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING 
      id,
      project_id,
      parent_task_id,
      title,
      description,
      status,
      priority,
      estimated_hours::float as estimated_hours,
      assignee_id,
      created_at,
      updated_at;
  `;

  const values = [
    data.projectId,
    data.parentTaskId || null,
    data.title.trim(),
    data.description ? data.description.trim() : null,
    data.status || 'TODO',
    data.priority || 'MEDIUM',
    data.estimatedHours || null,
    data.assigneeId || null,
  ];

  const result = await query<Task>(sql, values);
  return result.rows[0];
};

export const updateTask = async (
  taskId: string,
  data: UpdateTaskInput
): Promise<Task | null> => {
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
      status,
      priority,
      estimated_hours::float as estimated_hours,
      assignee_id,
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
