import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as taskService from '../services/task.service';
import * as projectService from '../services/project.service';
import * as activityService from '../services/activity.service';
import * as verificationService from '../services/verification/verification.service';
import { ReviewSubmissionSchema } from '../services/verification/verification.types';
import { AppError } from '../middleware/errorHandler';

// Zod schemas
const uuidSchema = z.string().uuid('Invalid ID format. Must be a valid UUID.');

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Task title is required' })
    .trim()
    .min(1, 'Task title cannot be empty'),
  description: z.string().trim().optional().nullable(),
  acceptanceCriteria: z.array(z.string().trim()).default([]).optional(),
  status: z.enum(['TODO']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  estimatedHours: z
    .number({ invalid_type_error: 'Estimated hours must be a number' })
    .positive('Estimated hours must be a positive number')
    .optional()
    .nullable(),
  requiredSkills: z.array(z.string().trim()).default([]).optional(),
  assigneeId: z.string().uuid('Invalid assignee ID format').optional().nullable(),
  parentTaskId: z.string().uuid('Invalid parent task ID format').optional().nullable(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Task title cannot be empty').optional(),
    description: z.string().trim().optional().nullable(),
    acceptanceCriteria: z.array(z.string().trim()).optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES_REQUESTED', 'DONE']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    estimatedHours: z
      .number({ invalid_type_error: 'Estimated hours must be a number' })
      .positive('Estimated hours must be a positive number')
      .optional()
      .nullable(),
    requiredSkills: z.array(z.string().trim()).optional(),
    assigneeId: z.string().uuid('Invalid assignee ID format').optional().nullable(),
    parentTaskId: z.string().uuid('Invalid parent task ID format').optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const taskFilterSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'CHANGES_REQUESTED', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().uuid('Invalid assignee ID filter format').optional(),
});

export const createDependencySchema = z.object({
  dependsOnTaskId: z.string().uuid('Invalid dependsOnTaskId format'),
});

// Controllers
export const listProjectTasks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedProjectId = uuidSchema.safeParse(req.params.projectId);
    if (!parsedProjectId.success) {
      throw new AppError('Project not found', 404);
    }

    // Verify project exists
    const project = await projectService.findProjectById(parsedProjectId.data);
    if (!project) {
      throw new AppError(`Project with ID ${req.params.projectId} not found`, 404);
    }

    // Validate query filters
    const filters = taskFilterSchema.parse(req.query);

    const tasks = await taskService.findTasksByProjectId(parsedProjectId.data, filters);
    res.status(200).json(tasks);
  } catch (error) {
    next(error);
  }
};

export const createProjectTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedProjectId = uuidSchema.safeParse(req.params.projectId);
    if (!parsedProjectId.success) {
      throw new AppError('Project not found', 404);
    }

    // Verify project exists
    const project = await projectService.findProjectById(parsedProjectId.data);
    if (!project) {
      throw new AppError(`Project with ID ${req.params.projectId} not found`, 404);
    }

    const validatedData = createTaskSchema.parse(req.body);

    // If assigneeId provided, verify user is registered in Orkestr and is a project member
    if (validatedData.assigneeId) {
      const memberCheck = await taskService.findRegisteredProjectMember(
        parsedProjectId.data,
        validatedData.assigneeId
      );
      if (!memberCheck.exists) {
        throw new AppError(`Assignee user with ID ${validatedData.assigneeId} not found`, 400);
      }
      if (!memberCheck.isRegistered) {
        throw new AppError('Tasks can only be assigned to registered Orkestr users', 400);
      }
      if (!memberCheck.isMember) {
        throw new AppError('Assignee must be an active member of this project', 400);
      }
    }

    // If parentTaskId provided, verify parent exists and belongs to the same project
    if (validatedData.parentTaskId) {
      const parentTask = await taskService.findTaskById(validatedData.parentTaskId);
      if (!parentTask) {
        throw new AppError(`Parent task with ID ${validatedData.parentTaskId} not found`, 400);
      }
      if (parentTask.project_id !== parsedProjectId.data) {
        throw new AppError('Parent task must belong to the same project', 400);
      }
    }

    const newTask = await taskService.createTask({
      projectId: parsedProjectId.data,
      ...validatedData,
    });

    res.status(201).json(newTask);
  } catch (error) {
    next(error);
  }
};

export const getTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    const taskWithDeps = await taskService.findTaskWithDependencies(parsedTaskId.data);
    if (!taskWithDeps) {
      throw new AppError(`Task with ID ${req.params.taskId} not found`, 404);
    }

    res.status(200).json(taskWithDeps);
  } catch (error) {
    next(error);
  }
};

export const updateTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    const currentTask = await taskService.findTaskById(parsedTaskId.data);
    if (!currentTask) {
      throw new AppError(`Task with ID ${req.params.taskId} not found`, 404);
    }

    const validatedData = updateTaskSchema.parse(req.body);

    // If assigneeId provided, verify user is registered in Orkestr and is a project member
    if (validatedData.assigneeId) {
      const memberCheck = await taskService.findRegisteredProjectMember(
        currentTask.project_id,
        validatedData.assigneeId
      );
      if (!memberCheck.exists) {
        throw new AppError(`Assignee user with ID ${validatedData.assigneeId} not found`, 400);
      }
      if (!memberCheck.isRegistered) {
        throw new AppError('Tasks can only be assigned to registered Orkestr users', 400);
      }
      if (!memberCheck.isMember) {
        throw new AppError('Assignee must be an active member of this project', 400);
      }
    }

    // If parentTaskId provided, verify constraints
    if (validatedData.parentTaskId !== undefined && validatedData.parentTaskId !== null) {
      if (validatedData.parentTaskId === parsedTaskId.data) {
        throw new AppError('A task cannot be its own parent', 400);
      }

      const parentTask = await taskService.findTaskById(validatedData.parentTaskId);
      if (!parentTask) {
        throw new AppError(`Parent task with ID ${validatedData.parentTaskId} not found`, 400);
      }
      if (parentTask.project_id !== currentTask.project_id) {
        throw new AppError('Parent task must belong to the same project', 400);
      }

      // Check for parent cycle
      const isParentCycle = await taskService.wouldCreateParentCycle(
        parsedTaskId.data,
        validatedData.parentTaskId
      );
      if (isParentCycle) {
        throw new AppError('Setting this parent would create a circular parent hierarchy', 400);
      }
    }

    const updated = await taskService.updateTask(parsedTaskId.data, validatedData, {
      userRole: req.projectMember?.role,
      userId: req.user?.id,
    });
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteTask = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    const deleted = await taskService.deleteTask(parsedTaskId.data);
    if (!deleted) {
      throw new AppError(`Task with ID ${req.params.taskId} not found`, 404);
    }

    res.status(200).json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getTaskDependencies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    const task = await taskService.findTaskById(parsedTaskId.data);
    if (!task) {
      throw new AppError(`Task with ID ${req.params.taskId} not found`, 404);
    }

    const dependencies = await taskService.findDependenciesByTaskId(parsedTaskId.data);
    res.status(200).json(dependencies);
  } catch (error) {
    next(error);
  }
};

export const createTaskDependency = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    const { dependsOnTaskId } = createDependencySchema.parse(req.body);

    if (parsedTaskId.data === dependsOnTaskId) {
      throw new AppError('A task cannot depend on itself', 400);
    }

    // Verify both tasks exist
    const [task, prerequisiteTask] = await Promise.all([
      taskService.findTaskById(parsedTaskId.data),
      taskService.findTaskById(dependsOnTaskId),
    ]);

    if (!task) {
      throw new AppError(`Task with ID ${req.params.taskId} not found`, 404);
    }
    if (!prerequisiteTask) {
      throw new AppError(`Prerequisite task with ID ${dependsOnTaskId} not found`, 404);
    }

    // Verify both belong to the same project
    if (task.project_id !== prerequisiteTask.project_id) {
      throw new AppError(
        'Cross-project dependencies are not allowed. Both tasks must belong to the same project',
        400
      );
    }

    // Verify dependency does not already exist
    const alreadyExists = await taskService.checkDependencyExists(
      parsedTaskId.data,
      dependsOnTaskId
    );
    if (alreadyExists) {
      throw new AppError('This dependency relationship already exists', 409);
    }

    // Check for circular dependency
    const formsCycle = await taskService.wouldCreateDependencyCycle(
      parsedTaskId.data,
      dependsOnTaskId
    );
    if (formsCycle) {
      throw new AppError('Adding this dependency would create a cycle', 400);
    }

    const dependency = await taskService.createDependency(parsedTaskId.data, dependsOnTaskId);
    res.status(201).json(dependency);
  } catch (error) {
    next(error);
  }
};

export const deleteTaskDependency = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    const parsedDependsOnTaskId = uuidSchema.safeParse(req.params.dependsOnTaskId);

    if (!parsedTaskId.success || !parsedDependsOnTaskId.success) {
      throw new AppError('Task or dependency not found', 404);
    }

    const deleted = await taskService.deleteDependency(
      parsedTaskId.data,
      parsedDependsOnTaskId.data
    );
    if (!deleted) {
      throw new AppError('Dependency relationship not found', 404);
    }

    res.status(200).json({ success: true, message: 'Dependency deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getTaskGitHubActivities = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    if (!req.projectMember) {
      throw new AppError('Membership context missing', 500);
    }

    const activities = await activityService.getActivitiesForTask(
      parsedTaskId.data,
      req.projectMember.projectId
    );

    res.status(200).json({
      success: true,
      activities,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyTaskHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const task = await taskService.findTaskById(parsedTaskId.data);
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    const userRole = req.projectMember?.role;
    const isAssignee = task.assignee_id === req.user.id;
    const isOwnerOrAdmin = userRole === 'OWNER' || userRole === 'ADMIN';

    if (!isAssignee && !isOwnerOrAdmin) {
      throw new AppError(
        'Access denied: Only the assigned developer or project owners/admins can submit this task for verification',
        403
      );
    }

    if (task.status === 'DONE') {
      throw new AppError('Task is already completed', 400);
    }

    const report = await verificationService.verifyTask(
      parsedTaskId.data,
      req.user.id
    );

    res.status(200).json({
      success: true,
      verification: report,
    });
  } catch (error) {
    next(error);
  }
};

export const getTaskVerificationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    const report = await verificationService.getLatestVerification(parsedTaskId.data);

    res.status(200).json({
      success: true,
      verification: report,
    });
  } catch (error) {
    next(error);
  }
};

export const reviewTaskVerificationHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsedTaskId = uuidSchema.safeParse(req.params.taskId);
    if (!parsedTaskId.success) {
      throw new AppError('Task not found', 404);
    }

    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const validatedInput = ReviewSubmissionSchema.parse(req.body);

    const updatedReport = await verificationService.submitReview(
      parsedTaskId.data,
      req.user.id,
      validatedInput.decision,
      validatedInput.feedback,
      validatedInput.acknowledgeStale
    );

    res.status(200).json({
      success: true,
      verification: updatedReport,
    });
  } catch (error) {
    next(error);
  }
};

