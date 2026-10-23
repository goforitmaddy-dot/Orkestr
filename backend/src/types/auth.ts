export interface PublicUser {
  id: string;
  name: string;
  username: string;
  email: string;
  skills: string[];
  weekly_capacity_hours: number;
  is_available: boolean;
  github_user_id?: string | null;
  github_username?: string | null;
  github_linked_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserRecord extends PublicUser {
  password_hash: string | null;
}

export type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface ProjectMemberContext {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
      projectMember?: ProjectMemberContext;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */
