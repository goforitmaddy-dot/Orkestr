import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as taskService from '../services/task.service';
import * as projectService from '../services/project.service';
import { AppError } from '../middleware/errorHandler';

// Zod schemas
const uuidSchema = z.string().uuid('Invalid ID format. Must be a valid UUID.');

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Task title is required' })
    .trim()
    .min(1, 'Task title cannot be empty'),
  description: z.string().trim().optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  estimatedHours: z
    .number({ invalid_type_error: 'Estimated hours must be a number' })
    .positive('Estimated hours must be a positive number')
    .optional()
    .nullable(),
  assigneeId: z.string().uuid('Invalid assignee ID format').optional().nullable(),
  parentTaskId: z.string().uuid('Invalid parent task ID format').optional().nullable(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Task title cannot be empty').optional(),
    description: z.string().trim().optional().nullable(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    estimatedHours: z
      .number({ invalid_type_error: 'Estimated hours must be a number' })
      .positive('Estimated hours must be a positive number')
      .optional()
      .nullable(),
    assigneeId: z.string().uuid('Invalid assignee ID format').optional().nullable(),
    parentTaskId: z.string().uuid('Invalid parent task ID format').optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  });

export const taskFilterSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
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

    // If assigneeId provided, verify user exists
    if (validatedData.assigneeId) {
      const userExists = await taskService.findUserById(validatedData.assigneeId);
      if (!userExists) {
        throw new AppError(`Assignee user with ID ${validatedData.assigneeId} not found`, 400);
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

    // If assigneeId provided, verify user exists
    if (validatedData.assigneeId) {
      const userExists = await taskService.findUserById(validatedData.assigneeId);
      if (!userExists) {
        throw new AppError(`Assignee user with ID ${validatedData.assigneeId} not found`, 400);
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

    const updated = await taskService.updateTask(parsedTaskId.data, validatedData);
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
