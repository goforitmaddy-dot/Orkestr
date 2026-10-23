import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import {
  authenticate,
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  updateUserProfile,
  AuthUser,
} from '../services/auth.service';

/**
 * Account and session endpoints.
 */

export const signupSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(1, 'Name cannot be empty'),
  email: z.string({ required_error: 'Email is required' }).trim().email('Enter a valid email address'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long'),
});

export const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).trim().email('Enter a valid email address'),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

const setSessionCookie = (res: Response, token: string, expiresAt: Date): void => {
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.auth.secureCookies,
    path: '/',
    expires: expiresAt,
  });
};

const clearSessionCookie = (res: Response): void => {
  res.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.auth.secureCookies,
    path: '/',
  });
};

const publicUser = (user: AuthUser) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  createdAt: user.created_at,
});

export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = signupSchema.parse(req.body);

    const existing = await findUserByEmail(data.email);
    if (existing) {
      throw new AppError('An account with that email already exists.', 409);
    }

    const user = await createUser(data);
    const session = await createSession(user.id, req.headers['user-agent']);

    setSessionCookie(res, session.token, session.expiresAt);

    res.status(201).json({
      success: true,
      data: { user: publicUser(user) },
      message: 'Account created.',
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await authenticate(data.email, data.password);
    if (!user) {
      throw new AppError('Incorrect email or password.', 401);
    }

    const session = await createSession(user.id, req.headers['user-agent']);

    setSessionCookie(res, session.token, session.expiresAt);

    res.status(200).json({
      success: true,
      data: { user: publicUser(user) },
      message: 'Signed in.',
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.sessionToken) {
      await destroySession(req.sessionToken);
    }
    clearSessionCookie(res);

    res.status(200).json({ success: true, message: 'Signed out.' });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }

    res.status(200).json({
      success: true,
      data: { user: publicUser(req.user) },
    });
  } catch (error) {
    next(error);
  }
};

export const updateCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }

    const schema = z.object({ name: z.string().trim().min(1, 'Name cannot be empty') });
    const data = schema.parse(req.body);

    const updated = await updateUserProfile(req.user.id, data.name);
    if (!updated) {
      throw new AppError('Account not found.', 404);
    }

    res.status(200).json({
      success: true,
      data: { user: publicUser(updated) },
      message: 'Profile updated.',
    });
  } catch (error) {
    next(error);
  }
};
