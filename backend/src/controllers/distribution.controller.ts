import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import {
  distributeTasksInputSchema,
  applyDistributionSchema,
} from '../services/distribution/distribution.types';
import * as distributionService from '../services/distribution/distribution.service';

const uuidSchema = z.string().uuid('Invalid ID format. Must be a valid UUID.');

export const previewDistributionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedProjectId = uuidSchema.safeParse(req.params.projectId);
    if (!parsedProjectId.success) {
      throw new AppError('Project not found', 404);
    }

    const validatedInput = distributeTasksInputSchema.parse(req.body || {});
    const preview = await distributionService.previewTaskDistribution(
      parsedProjectId.data,
      validatedInput
    );

    res.status(200).json(preview);
  } catch (error) {
    next(error);
  }
};

export const applyDistributionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedProjectId = uuidSchema.safeParse(req.params.projectId);
    if (!parsedProjectId.success) {
      throw new AppError('Project not found', 404);
    }

    const validatedInput = applyDistributionSchema.parse(req.body);
    const result = await distributionService.applyTaskDistribution(
      parsedProjectId.data,
      validatedInput
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
