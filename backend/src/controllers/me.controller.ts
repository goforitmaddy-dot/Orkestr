import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { findTasksForUser } from '../services/task.service';

export const getMyTasksHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const rawScope = req.query.scope;
    const scope: 'assigned' | 'all' | 'unassigned' =
      rawScope === 'all' || rawScope === 'unassigned' ? rawScope : 'assigned';

    const tasks = await findTasksForUser(req.user.id, scope);
    res.json(tasks);
  } catch (err) {
    next(err);
  }
};
