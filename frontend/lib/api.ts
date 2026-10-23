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
      ...options,
      headers,
      // The session lives in an httpOnly cookie, so every request has to
      // include credentials.
      credentials: 'include',
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

  /**
   * Subscribes to the backend's live event stream.
   *
   * Returns a disposer. The browser reconnects automatically when the stream
   * drops, so callers only need to react to the events they care about.
   */
  // Authentication
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
};
