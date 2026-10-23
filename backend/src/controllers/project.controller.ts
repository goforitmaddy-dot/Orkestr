import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as projectService from '../services/project.service';
import { AppError } from '../middleware/errorHandler';

// Zod validation schemas
export const createProjectSchema = z.object({
  name: z.string({ required_error: 'Project name is required' }).trim().min(1, 'Project name cannot be empty'),
  description: z.string().trim().optional().nullable(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name cannot be empty').optional(),
  description: z.string().trim().optional().nullable(),
}).refine(data => data.name !== undefined || data.description !== undefined, {
  message: 'At least one field (name or description) must be provided to update',
});

const uuidSchema = z.string().uuid('Invalid project ID format. Must be a valid UUID.');

export const listProjects = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }
    const projects = await projectService.findProjectsForUser(req.user.id);
    res.status(200).json(projects);
  } catch (error) {
    next(error);
  }
};

export const getProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const project = await projectService.findProjectById(parsedId.data);
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    res.status(200).json(project);
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }
    const validatedData = createProjectSchema.parse(req.body);
    const newProject = await projectService.createProject(validatedData, req.user.id);
    res.status(201).json(newProject);
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const validatedData = updateProjectSchema.parse(req.body);
    const updated = await projectService.updateProject(parsedId.data, validatedData);
    if (!updated) {
      throw new AppError('Project not found', 404);
    }

    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const deleted = await projectService.deleteProject(parsedId.data);
    if (!deleted) {
      throw new AppError('Project not found', 404);
    }

    res.status(200).json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    next(error);
  }
};
