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
  PlanRequestInput,
  PlanResponse,
  ApplyPlanResult,
  ProjectMemberWithUser,
  AddProjectMemberInput,
  DistributeTasksInput,
  DistributionPreviewResponse,
  ApplyDistributionInput,
  AuthUser,
  RegisterInput,
  LoginInput,
  PersonalTask,
  GitHubIdentityStatus,
  ProjectGitHubStatus,
  ConnectRepositoryInput,
  TaskGitHubActivity,
  TaskVerification,
  ReviewSubmissionInput,
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
      credentials: 'include',
      ...options,
      headers,
    });

    if (response.status === 204) {
      return {} as T;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorPayload = data as ApiErrorResponse | null;
      let message = errorPayload?.error?.message || `Request failed with status ${response.status}`;
      if (
        errorPayload?.error?.details &&
        Array.isArray(errorPayload.error.details) &&
        errorPayload.error.details.length > 0
      ) {
        const detailMsgs = errorPayload.error.details
          .map((d: any) => d.message || `${d.path}: invalid`)
          .join(', ');
        message = `${message}: ${detailMsgs}`;
      }
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

  getTaskGitHubActivities: async (taskId: string): Promise<TaskGitHubActivity[]> => {
    const res = await request<{ success: boolean; activities: TaskGitHubActivity[] }>(
      `/tasks/${taskId}/github-activities`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );
    return res.activities || [];
  },

  // AI Task Verification & Review
  verifyTask: async (taskId: string): Promise<TaskVerification> => {
    const res = await request<{ success: boolean; verification: TaskVerification }>(
      `/tasks/${taskId}/verify`,
      {
        method: 'POST',
      }
    );
    return res.verification;
  },

  getTaskVerification: async (taskId: string): Promise<TaskVerification | null> => {
    const res = await request<{ success: boolean; verification: TaskVerification | null }>(
      `/tasks/${taskId}/verification`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );
    return res.verification;
  },

  reviewTaskVerification: async (
    taskId: string,
    input: ReviewSubmissionInput
  ): Promise<TaskVerification> => {
    const res = await request<{ success: boolean; verification: TaskVerification }>(
      `/tasks/${taskId}/review`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    return res.verification;
  },

  // AI Planning
  generateProjectPlan: (
    projectId: string,
    input: PlanRequestInput
  ): Promise<PlanResponse> => {
    return request<PlanResponse>(`/projects/${projectId}/ai/plan`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  applyProjectPlan: (
    projectId: string,
    plan: PlanResponse
  ): Promise<ApplyPlanResult> => {
    return request<ApplyPlanResult>(`/projects/${projectId}/ai/plan/apply`, {
      method: 'POST',
      body: JSON.stringify(plan),
    });
  },

  // Project Members
  getProjectMembers: (projectId: string): Promise<ProjectMemberWithUser[]> => {
    return request<ProjectMemberWithUser[]>(`/projects/${projectId}/members`, {
      method: 'GET',
      cache: 'no-store',
    });
  },

  addProjectMember: (
    projectId: string,
    input: AddProjectMemberInput
  ): Promise<ProjectMemberWithUser> => {
    return request<ProjectMemberWithUser>(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  removeProjectMember: (
    projectId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> => {
    return request<{ success: boolean; message: string }>(
      `/projects/${projectId}/members/${userId}`,
      {
        method: 'DELETE',
      }
    );
  },

  // Task Distribution Engine
  previewTaskDistribution: (
    projectId: string,
    input: DistributeTasksInput = {}
  ): Promise<DistributionPreviewResponse> => {
    return request<DistributionPreviewResponse>(`/projects/${projectId}/ai/distribute`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  applyTaskDistribution: (
    projectId: string,
    input: ApplyDistributionInput
  ): Promise<{ success: boolean; message: string; updatedCount: number }> => {
    return request<{ success: boolean; message: string; updatedCount: number }>(
      `/projects/${projectId}/ai/distribute/apply`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  },

  // Authentication V1
  register: (input: RegisterInput): Promise<AuthUser> => {
    return request<AuthUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  login: (input: LoginInput): Promise<AuthUser> => {
    return request<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  logout: (): Promise<{ success: boolean; message: string }> => {
    return request<{ success: boolean; message: string }>('/auth/logout', {
      method: 'POST',
    });
  },

  getMe: (): Promise<AuthUser> => {
    return request<AuthUser>('/auth/me');
  },

  // Personal Developer Dashboard V1
  getMyTasks: (scope?: 'assigned' | 'all' | 'unassigned'): Promise<PersonalTask[]> => {
    const query = scope ? `?scope=${scope}` : '';
    return request<PersonalTask[]>(`/me/tasks${query}`, { method: 'GET', cache: 'no-store' });
  },

  // Users Directory
  getUsers: (
    options?: string | { search?: string; all?: boolean }
  ): Promise<
    Array<{
      id: string;
      name: string;
      username: string;
      email: string;
      skills: string[];
      weekly_capacity_hours: number;
      is_available: boolean;
    }>
  > => {
    let query = '';
    if (typeof options === 'string') {
      if (options.trim()) query = `?search=${encodeURIComponent(options.trim())}`;
    } else if (options) {
      const params = new URLSearchParams();
      if (options.search) params.append('search', options.search);
      if (options.all) params.append('all', 'true');
      const qs = params.toString();
      if (qs) query = `?${qs}`;
    }
    return request(`/users${query}`);
  },

  // GitHub Integration Foundation
  getGitHubStatus: (): Promise<GitHubIdentityStatus> => {
    return request<GitHubIdentityStatus>('/auth/github/status', {
      method: 'GET',
      cache: 'no-store',
    });
  },

  getGitHubConnectUrl: (returnTo?: string, transfer?: boolean): Promise<{ state: string; authUrl: string }> => {
    const qs = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : '';
    const transferQs = transfer ? '&transfer=true' : '';
    return request<{ state: string; authUrl: string }>(`/auth/github/connect?format=json${qs}${transferQs}`, {
      method: 'GET',
    });
  },

  disconnectGitHub: (): Promise<{ success: boolean; message: string; user: AuthUser }> => {
    return request<{ success: boolean; message: string; user: AuthUser }>('/auth/github/disconnect', {
      method: 'DELETE',
    });
  },

  getProjectGitHub: (projectId: string): Promise<ProjectGitHubStatus> => {
    return request<ProjectGitHubStatus>(`/projects/${projectId}/github`, {
      method: 'GET',
      cache: 'no-store',
    });
  },

  connectProjectRepository: (
    projectId: string,
    input: ConnectRepositoryInput
  ): Promise<{ success: boolean; message: string; repository: ProjectGitHubStatus }> => {
    return request<{ success: boolean; message: string; repository: ProjectGitHubStatus }>(
      `/projects/${projectId}/github/connect`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  },

  disconnectProjectRepository: (
    projectId: string
  ): Promise<{ success: boolean; message: string; repository: ProjectGitHubStatus }> => {
    return request<{ success: boolean; message: string; repository: ProjectGitHubStatus }>(
      `/projects/${projectId}/github/disconnect`,
      {
        method: 'DELETE',
      }
    );
  },
};
