import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config/env';

export class AppError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    error: {
      message: `Cannot ${req.method} ${req.originalUrl}`,
      statusCode: 404,
    },
  });
};

export const errorHandler = (
  err: Error | AppError | ZodError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        statusCode: 400,
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        statusCode: err.statusCode,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // PostgreSQL specific error handling
  const pgError = err as { code?: string; detail?: string; message: string };
  if (pgError.code) {
    // 23505 = Unique violation
    if (pgError.code === '23505') {
      return res.status(409).json({
        error: {
          message: 'Resource conflict: a record with these unique values already exists',
          statusCode: 409,
          detail: pgError.detail,
        },
      });
    }
    // 22P02 = Invalid text representation (e.g. invalid UUID format)
    if (pgError.code === '22P02') {
      return res.status(400).json({
        error: {
          message: 'Invalid input format (e.g. malformed UUID)',
          statusCode: 400,
        },
      });
    }
    // Database connection error
    if (pgError.code === 'ECONNREFUSED' || pgError.code === '28P01') {
      console.error('PostgreSQL database connection error:', pgError.message);
      return res.status(503).json({
        error: {
          message: 'Database service is currently unavailable',
          statusCode: 503,
        },
      });
    }
  }

  // Generic fallback error
  console.error('Unhandled server error:', err);
  const responsePayload: Record<string, unknown> = {
    error: {
      message: config.isProduction ? 'Internal Server Error' : err.message || 'Internal Server Error',
      statusCode: 500,
      ...(!config.isProduction && err.stack ? { stack: err.stack } : {}),
    },
  };

  return res.status(500).json(responsePayload);
};
