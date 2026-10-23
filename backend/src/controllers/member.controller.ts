import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as memberService from '../services/member.service';
import * as projectService from '../services/project.service';
import { AppError } from '../middleware/errorHandler';

const uuidSchema = z.string().uuid('Invalid ID format. Must be a valid UUID.');

export const addMemberSchema = z
  .object({
    userId: z.string().uuid().optional(),
    username: z.string().trim().optional(),
    name: z.string().trim().min(1, 'Name is required').optional(),
    email: z.string().trim().optional(),
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
    skills: z.array(z.string().trim()).default([]),
    weeklyCapacityHours: z.number().int().positive().max(168).default(40),
    isAvailable: z.boolean().default(true),
  })
  .refine((data) => !!(data.userId || data.username || data.email), {
    message: 'Either userId, username, or email must be provided',
  });

export const listProjectMembersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedProjectId = uuidSchema.safeParse(req.params.projectId);
    if (!parsedProjectId.success) {
      throw new AppError('Project not found', 404);
    }

    const project = await projectService.findProjectById(parsedProjectId.data);
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const members = await memberService.findProjectMembers(parsedProjectId.data);
    res.status(200).json(members);
  } catch (error) {
    next(error);
  }
};

export const addProjectMemberHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedProjectId = uuidSchema.safeParse(req.params.projectId);
    if (!parsedProjectId.success) {
      throw new AppError('Project not found', 404);
    }

    const project = await projectService.findProjectById(parsedProjectId.data);
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const validatedInput = addMemberSchema.parse(req.body);
    const newMember = await memberService.addProjectMember(parsedProjectId.data, validatedInput);

    res.status(201).json(newMember);
  } catch (error) {
    next(error);
  }
};

export const removeProjectMemberHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedProjectId = uuidSchema.safeParse(req.params.projectId);
    const parsedUserId = uuidSchema.safeParse(req.params.userId);

    if (!parsedProjectId.success || !parsedUserId.success) {
      throw new AppError('Project or member not found', 404);
    }

    // Role hierarchy protection: Admins cannot remove Owners
    const members = await memberService.findProjectMembers(parsedProjectId.data);
    const targetMember = members.find((m) => m.user_id === parsedUserId.data);
    if (!targetMember) {
      throw new AppError('Member not found in project', 404);
    }

    if (targetMember.role === 'OWNER' && req.projectMember?.role !== 'OWNER') {
      throw new AppError('Access denied: Admins cannot remove project owners', 403);
    }

    await memberService.removeProjectMember(parsedProjectId.data, parsedUserId.data);
    res.status(200).json({ success: true, message: 'Member removed from project' });
  } catch (error) {
    next(error);
  }
};

export const listUsersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const all = req.query.all === 'true';
    const users = await memberService.findAuthorizedUsers(req.user.id, search, all);
    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

