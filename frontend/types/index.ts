export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export type ProjectMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  created_at: string;
}

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

export interface TaskDependencyInfo {
  id: string;
  title: string;
  status: TaskStatus;
  priority?: TaskPriority;
}

export interface TaskWithDependencies extends Task {
  depends_on: TaskDependencyInfo[];
  dependent_tasks: TaskDependencyInfo[];
}

export interface TaskDependenciesResponse {
  dependsOn: TaskDependencyInfo[];
  dependentTasks: TaskDependencyInfo[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number;
  assigneeId?: string;
  parentTaskId?: string;
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

export interface HealthStatus {
  status: string;
  uptime: number;
  timestamp: string;
  services: {
    api: string;
    database: 'connected' | 'disconnected';
  };
}

export interface ApiErrorResponse {
  error: {
    message: string;
    statusCode: number;
    details?: Array<{ path: string; message: string }>;
  };
}
