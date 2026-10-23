import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { config } from '../config/env';

interface AttemptRecord {
  count: number;
  resetTime: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const registerAttempts = new Map<string, AttemptRecord>();

const cleanupInterval = 10 * 60 * 1000; // 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now > record.resetTime) loginAttempts.delete(key);
  }
  for (const [key, record] of registerAttempts.entries()) {
    if (now > record.resetTime) registerAttempts.delete(key);
  }
}, cleanupInterval).unref();

export const loginRateLimiter = (req: Request, _res: Response, next: NextFunction) => {
  if (config.nodeEnv === 'test') {
    return next();
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = config.isProduction ? 15 : 1000;

  const record = loginAttempts.get(clientIp);
  if (!record || now > record.resetTime) {
    loginAttempts.set(clientIp, { count: 1, resetTime: now + windowMs });
    return next();
  }

  if (record.count >= maxAttempts) {
    throw new AppError('Too many login attempts. Please try again in 15 minutes.', 429);
  }

  record.count += 1;
  return next();
};

export const registerRateLimiter = (req: Request, _res: Response, next: NextFunction) => {
  if (config.nodeEnv === 'test') {
    return next();
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxAttempts = config.isProduction ? 20 : 1000;

  const record = registerAttempts.get(clientIp);
  if (!record || now > record.resetTime) {
    registerAttempts.set(clientIp, { count: 1, resetTime: now + windowMs });
    return next();
  }

  if (record.count >= maxAttempts) {
    throw new AppError('Too many registration attempts. Please try again later.', 429);
  }

  record.count += 1;
  return next();
};
