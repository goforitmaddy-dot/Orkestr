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
