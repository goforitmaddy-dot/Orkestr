import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { planRequestSchema, planResponseSchema } from '../services/ai/ai.types';
import * as aiService from '../services/ai/ai.service';

const uuidSchema = z.string().uuid('Invalid project ID format. Must be a valid UUID.');

export const generatePlanHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.projectId);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const validatedInput = planRequestSchema.parse(req.body);
    const plan = await aiService.generateProjectPlan(parsedId.data, validatedInput);

    res.status(200).json(plan);
  } catch (error) {
    next(error);
  }
};

export const applyPlanHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.projectId);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const validatedPlan = planResponseSchema.parse(req.body);
    const result = await aiService.applyProjectPlan(parsedId.data, validatedPlan);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
