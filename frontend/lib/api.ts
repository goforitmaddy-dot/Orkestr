import {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  HealthStatus,
  ApiErrorResponse,
  Incident,
  IncidentDetails,
  ApplicationError,
  MonitoringStatus,
  MonitoringSummary,
  MonitoringEventType,
  AuthUser,
  GitHubConnection,
  PollCycleResult,
  ServerMonitoringConfig,
  ServerHealth,
  ServerErrorReport,
  ServerErrorSeverity,
  Task,
  TaskWithDependencies,
  TaskDependenciesResponse,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilterOptions,
  PlanRequestInput,
  PlanResponse,
  ApplyPlanResult,
  ProjectMemberWithUser,
  AddProjectMemberInput,
  DistributeTasksInput,
  DistributionPreviewResponse,
  ApplyDistributionInput,
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

export interface AuthResponse {
  success: boolean;
  data: { user: AuthUser };
  message?: string;
}

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
      credentials: 'include',
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

  // Live Error Monitoring & Incidents
  getIncidents: (params: { status?: string; repository?: string } = {}): Promise<Incident[]> => {
    const queryParts: string[] = [];
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params.repository) queryParts.push(`repository=${encodeURIComponent(params.repository)}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return request<Incident[]>(`/incidents${qs}`, { method: 'GET', cache: 'no-store' });
  },

  getIncident: (id: string): Promise<IncidentDetails> => {
    return request<IncidentDetails>(`/incidents/${id}`, { method: 'GET', cache: 'no-store' });
  },

  resolveIncident: (id: string): Promise<{ success: boolean; message: string; data: Incident }> => {
    return request<{ success: boolean; message: string; data: Incident }>(`/incidents/${id}/resolve`, {
      method: 'POST',
    });
  },

  // Application runtime errors
  getApplicationErrors: (
    params: { status?: string; projectId?: string; repository?: string } = {}
  ): Promise<ApplicationError[]> => {
    const queryParts: string[] = [];
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params.projectId) queryParts.push(`projectId=${encodeURIComponent(params.projectId)}`);
    if (params.repository) queryParts.push(`repository=${encodeURIComponent(params.repository)}`);
    const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return request<ApplicationError[]>(`/errors${qs}`, { method: 'GET', cache: 'no-store' });
  },

  getApplicationError: (id: string): Promise<ApplicationError> => {
    return request<ApplicationError>(`/errors/${id}`, { method: 'GET', cache: 'no-store' });
  },

  resolveApplicationError: (id: string): Promise<{ success: boolean; message: string; data: ApplicationError }> => {
    return request<{ success: boolean; message: string; data: ApplicationError }>(
      `/errors/${id}/resolve`,
      { method: 'POST' }
    );
  },

  // Monitoring status
  getMonitoringStatus: (): Promise<MonitoringStatus> => {
    return request<MonitoringStatus>('/monitoring/status', { method: 'GET', cache: 'no-store' });
  },

  getMonitoringSummary: (): Promise<MonitoringSummary> => {
    return request<MonitoringSummary>('/monitoring/summary', { method: 'GET', cache: 'no-store' });
  },

  triggerMonitoringPoll: (): Promise<{
    success: boolean;
    message: string;
    data: PollCycleResult | null;
  }> => {
    return request('/monitoring/poll', { method: 'POST' });
  },

  // Live server monitoring
  configureServerMonitoring: (projectId: string, config: ServerMonitoringConfig) => {
    return request<{ success: boolean; message: string }>(
      `/projects/${projectId}/server-monitoring`,
      { method: 'POST', body: JSON.stringify(config) }
    );
  },

  getServerHealth: (projectId: string): Promise<ServerHealth> => {
    return request<ServerHealth>(`/projects/${projectId}/server-health`, {
      method: 'GET',
      cache: 'no-store',
    });
  },

  reportServerError: (
    projectId: string,
    error: {
      message: string;
      stackTrace?: string;
      severity?: ServerErrorSeverity;
      environment?: string;
    }
  ) => {
    return request<{ success: boolean; message: string }>(
      `/projects/${projectId}/server-errors`,
      { method: 'POST', body: JSON.stringify(error) }
    );
  },

  getServerErrors: (projectId: string): Promise<ServerErrorReport[]> => {
    return request<ServerErrorReport[]>(`/projects/${projectId}/server-errors`, {
      method: 'GET',
      cache: 'no-store',
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

  // Authentication V1 (monitoring feature)
  signup: (input: { name: string; email: string; password: string }): Promise<AuthResponse> => {
    return request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  login: (input: { email: string; password: string }): Promise<AuthResponse> => {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  logout: (): Promise<{ success: boolean; message: string }> => {
    return request<{ success: boolean; message: string }>('/auth/logout', { method: 'POST' });
  },

  getCurrentUser: (): Promise<AuthResponse> => {
    return request<AuthResponse>('/auth/me', { method: 'GET', cache: 'no-store' });
  },

  // GitHub connections (per user)
  getGitHubConnections: (): Promise<GitHubConnection[]> => {
    return request<{ data: GitHubConnection[] }>('/github-connections', {
      method: 'GET',
      cache: 'no-store',
    }).then((response) => response.data);
  },

  createGitHubConnection: (token: string): Promise<{ connection: GitHubConnection; message: string }> => {
    return request<{ data: { connection: GitHubConnection }; message: string }>(
      '/github-connections',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      }
    ).then((response) => ({ connection: response.data.connection, message: response.message }));
  },

  validateGitHubConnection: (id: string): Promise<{ connection: GitHubConnection; message: string }> => {
    return request<{ data: { connection: GitHubConnection }; message: string }>(
      `/github-connections/${id}/validate`,
      { method: 'POST' }
    ).then((response) => ({ connection: response.data.connection, message: response.message }));
  },

  deleteGitHubConnection: (id: string): Promise<{ success: boolean; message: string }> => {
    return request<{ success: boolean; message: string }>(`/github-connections/${id}`, {
      method: 'DELETE',
    });
  },

  subscribeToMonitoringEvents: (
    onEvent: (type: MonitoringEventType, data: unknown) => void,
    onConnectionChange?: (connected: boolean) => void
  ): (() => void) => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return () => undefined;
    }

    const source = new EventSource(`${API_BASE_URL}/monitoring/stream`, {
      withCredentials: true,
    });

    const handle = (type: MonitoringEventType) => (event: MessageEvent) => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        payload = null;
      }
      onEvent(type, payload);
    };

    const eventTypes: MonitoringEventType[] = [
      'incident.created',
      'incident.updated',
      'incident.resolved',
      'error.created',
      'error.updated',
      'error.resolved',
      'monitoring.status',
    ];

    eventTypes.forEach((type) => source.addEventListener(type, handle(type)));

    source.onopen = () => onConnectionChange?.(true);
    source.onerror = () => onConnectionChange?.(false);

    return () => source.close();
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
