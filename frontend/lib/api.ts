import { Project, CreateProjectInput, UpdateProjectInput, HealthStatus, ApiErrorResponse } from '../types';

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
};
