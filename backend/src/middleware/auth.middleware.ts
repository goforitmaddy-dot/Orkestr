import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { findUserById } from '../services/auth.service';
import { query } from '../db';
import { ProjectRole } from '../types/auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (id: string): boolean => UUID_REGEX.test(id);

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      throw new AppError('Authentication required. Please log in.', 401);
    }

    const user = await findUserById(userId);

    if (!user) {
      // Invalidate stale session
      req.session.destroy(() => {});
      res.clearCookie('orkestr.sid');
      throw new AppError('User session is invalid. Please log in again.', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.session?.userId;
    if (userId) {
      const user = await findUserById(userId);
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch {
    next();
  }
};

export const requireProjectMember = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const projectId = req.params.projectId || req.params.id;
    if (!projectId || !isUuid(projectId)) {
      throw new AppError('Project not found', 404);
    }

    // Verify project exists
    const projRes = await query('SELECT id FROM projects WHERE id = $1', [projectId]);
    if (projRes.rows.length === 0) {
      throw new AppError('Project not found', 404);
    }

    // Check project membership
    const memberRes = await query<{ id: string; role: ProjectRole }>(
      'SELECT id, role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );

    if (memberRes.rows.length === 0) {
      throw new AppError('Access denied: You are not a member of this project', 403);
    }

    req.projectMember = {
      id: memberRes.rows[0].id,
      projectId,
      userId: req.user.id,
      role: memberRes.rows[0].role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireProjectRole = (allowedRoles: ProjectRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.projectMember) {
      return next(new AppError('Membership context missing', 500));
    }

    if (!allowedRoles.includes(req.projectMember.role)) {
      return next(
        new AppError(
          `Access denied: Insufficient project permissions. Requires ${allowedRoles.join(' or ')} role.`,
          403
        )
      );
    }

    next();
  };
};

export const requireTaskAccess = (operation: 'read' | 'update' | 'delete' | 'dependency' | 'review') => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const taskId = req.params.taskId;
      if (!taskId || !isUuid(taskId)) {
        throw new AppError('Task not found', 404);
      }

      const taskRes = await query<{ id: string; project_id: string; assignee_id: string | null }>(
        'SELECT id, project_id, assignee_id FROM tasks WHERE id = $1',
        [taskId]
      );

      if (taskRes.rows.length === 0) {
        throw new AppError('Task not found', 404);
      }

      const task = taskRes.rows[0];

      // Check user is a member of the task's project
      const memberRes = await query<{ id: string; role: ProjectRole }>(
        'SELECT id, role FROM project_members WHERE project_id = $1 AND user_id = $2',
        [task.project_id, req.user.id]
      );

      if (memberRes.rows.length === 0) {
        // Obscure existence for unauthorized users
        throw new AppError('Task not found', 404);
      }

      const userRole = memberRes.rows[0].role;
      req.projectMember = {
        id: memberRes.rows[0].id,
        projectId: task.project_id,
        userId: req.user.id,
        role: userRole,
      };

      if (operation === 'review') {
        if (userRole !== 'OWNER' && userRole !== 'ADMIN') {
          throw new AppError(
            'Access denied: Only project owners and admins can review task verification',
            403
          );
        }
      } else if (operation === 'delete') {
        if (userRole === 'MEMBER') {
          throw new AppError('Access denied: Only project owners and admins can delete tasks', 403);
        }
      } else if (operation === 'dependency') {
        if (req.method !== 'GET' && userRole === 'MEMBER') {
          throw new AppError(
            'Access denied: Only project owners and admins can manage task dependencies',
            403
          );
        }
      } else if (operation === 'update') {
        if (userRole === 'MEMBER') {
          // Allow member to claim an unassigned task for themselves
          const isClaiming = !task.assignee_id && req.body && req.body.assigneeId === req.user.id;

          if (task.assignee_id !== req.user.id && !isClaiming) {
            throw new AppError('Access denied: Members can only update tasks assigned to them', 403);
          }

          // Check payload: members are allowed to update status, or claim unassigned tasks
          const allowedKeys = isClaiming ? ['assigneeId'] : ['status'];
          const payloadKeys = Object.keys(req.body);
          const disallowedKeys = payloadKeys.filter(
            (k) => !allowedKeys.includes(k) && req.body[k] !== undefined
          );
          if (disallowedKeys.length > 0) {
            throw new AppError(
              'Access denied: Members are only permitted to update task status or claim unassigned tasks',
              403
            );
          }
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
