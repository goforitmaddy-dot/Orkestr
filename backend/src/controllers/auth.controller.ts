import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { AppError } from '../middleware/errorHandler';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  email: z.string().trim().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  skills: z.array(z.string().trim()).optional().default([]),
  weeklyCapacityHours: z.number().int().positive().max(168).optional().default(40),
  isAvailable: z.boolean().optional().default(true),
});

export const loginSchema = z
  .object({
    emailOrUsername: z.string().trim().min(1, 'Email or username is required').optional(),
    email: z.string().trim().optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => !!(data.emailOrUsername || data.email), {
    message: 'Email or username is required',
    path: ['emailOrUsername'],
  });

export const registerHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedInput = registerSchema.parse(req.body);
    const user = await authService.registerUser(validatedInput);

    // Regenerate session to prevent session fixation and set session userId
    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }
        res.status(201).json(user);
      });
    });
  } catch (error) {
    next(error);
  }
};

export const loginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsed = loginSchema.parse(req.body);
    const identifier = (parsed.emailOrUsername || parsed.email || '').trim();
    const user = await authService.loginUser(identifier, parsed.password);

    // Regenerate session upon successful login
    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }
        res.status(200).json(user);
      });
    });
  } catch (error) {
    next(error);
  }
};

export const logoutHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }
    res.clearCookie('orkestr.sid', { path: '/' });
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  });
};

export const meHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      throw new AppError('Not authenticated', 401);
    }

    const user = await authService.findUserById(userId);
    if (!user) {
      req.session.destroy(() => {});
      res.clearCookie('orkestr.sid', { path: '/' });
      throw new AppError('User not found. Session expired.', 401);
    }

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};
