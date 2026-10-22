import {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  Task,
  TaskWithDependencies,
  TaskDependenciesResponse,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilterOptions,
  HealthStatus,
  ApiErrorResponse,
} from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

export class ApiError extends Error {
  public statusCode: number;
  public details?: Array<{ path: string; message: string }>;

  constructor(message: string, statusCode: number, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 204) {
      return {} as T;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorPayload = data as ApiErrorResponse | null;
      const message = errorPayload?.error?.message || `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, errorPayload?.error?.details);
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network error or server offline
    const isNetworkError = error instanceof TypeError && error.message.includes('fetch');
    const message = isNetworkError
      ? `Cannot connect to backend server at ${API_BASE_URL}. Ensure backend is running.`
      : (error as Error).message || 'An unexpected network error occurred';

    throw new ApiError(message, 0);
  }
}

export const api = {
  // Health
  getHealth: (): Promise<HealthStatus> => {
    return request<HealthStatus>('/health', { method: 'GET', cache: 'no-store' });
  },

  // Projects
  getProjects: (): Promise<Project[]> => {
    return request<Project[]>('/projects', { method: 'GET', cache: 'no-store' });
  },

  getProject: (id: string): Promise<Project> => {
    return request<Project>(`/projects/${id}`, { method: 'GET', cache: 'no-store' });
  },

  createProject: (input: CreateProjectInput): Promise<Project> => {
    return request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateProject: (id: string, input: UpdateProjectInput): Promise<Project> => {
    return request<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  deleteProject: (id: string): Promise<{ success: boolean; message: string }> => {
    return request<{ success: boolean; message: string }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  },

  // Tasks
  getProjectTasks: (projectId: string, filters?: TaskFilterOptions): Promise<Task[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.assigneeId) params.append('assigneeId', filters.assigneeId);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<Task[]>(`/projects/${projectId}/tasks${queryString}`, {
      method: 'GET',
      cache: 'no-store',
    });
  },

  createProjectTask: (projectId: string, input: CreateTaskInput): Promise<Task> => {
    return request<Task>(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getTask: (taskId: string): Promise<TaskWithDependencies> => {
    return request<TaskWithDependencies>(`/tasks/${taskId}`, {
      method: 'GET',
      cache: 'no-store',
    });
  },

  updateTask: (taskId: string, input: UpdateTaskInput): Promise<Task> => {
    return request<Task>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  deleteTask: (taskId: string): Promise<{ success: boolean; message: string }> => {
    return request<{ success: boolean; message: string }>(`/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },

  // Task Dependencies
  getTaskDependencies: (taskId: string): Promise<TaskDependenciesResponse> => {
    return request<TaskDependenciesResponse>(`/tasks/${taskId}/dependencies`, {
      method: 'GET',
      cache: 'no-store',
    });
  },

  createTaskDependency: (
    taskId: string,
    dependsOnTaskId: string
  ): Promise<{ task_id: string; depends_on_task_id: string; created_at: string }> => {
    return request<{ task_id: string; depends_on_task_id: string; created_at: string }>(
      `/tasks/${taskId}/dependencies`,
      {
        method: 'POST',
        body: JSON.stringify({ dependsOnTaskId }),
      }
    );
  },

  deleteTaskDependency: (
    taskId: string,
    dependsOnTaskId: string
  ): Promise<{ success: boolean; message: string }> => {
    return request<{ success: boolean; message: string }>(
      `/tasks/${taskId}/dependencies/${dependsOnTaskId}`,
      {
        method: 'DELETE',
      }
    );
  },
};
