import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import {
  findApplicationErrorById,
  listApplicationErrors,
  recordApplicationError,
  resolveApplicationError,
} from '../services/applicationError.service';

/**
 * Runtime Error Controller
 *
 * Ingests application exceptions reported by running services and exposes
 * them for the live monitor. No error data is ever fabricated here - every
 * record originates from an actual report.
 */

const asOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const ingestApplicationError = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;

    const message = asOptionalString(body.message);
    if (!message) {
      throw new AppError('message is required to report an application error', 400);
    }

    const affectedUsersRaw = body.affectedUsers ?? body.affected_users;
    const affectedUsers =
      typeof affectedUsersRaw === 'number' && Number.isFinite(affectedUsersRaw)
        ? affectedUsersRaw
        : null;

    const context =
      body.context && typeof body.context === 'object' && !Array.isArray(body.context)
        ? (body.context as Record<string, unknown>)
        : null;

    const { record, created } = await recordApplicationError({
      message,
      stackTrace: asOptionalString(body.stackTrace ?? body.stack_trace ?? body.stack),
      errorType: asOptionalString(body.errorType ?? body.error_type ?? body.type),
      level: asOptionalString(body.level),
      environment: asOptionalString(body.environment ?? body.env),
      service: asOptionalString(body.service),
      repository: asOptionalString(body.repository ?? body.repository_name),
      projectId: asOptionalString(body.projectId ?? body.project_id),
      release: asOptionalString(body.release ?? body.release_version),
      url: asOptionalString(body.url ?? body.source_url),
      affectedUsers,
      fingerprint: asOptionalString(body.fingerprint),
      context,
    }, req.user?.id ?? null);

    res.status(created ? 201 : 200).json({
      success: true,
      created,
      data: record,
      message: created
        ? 'Application error recorded.'
        : 'Application error occurrence recorded against an existing error.',
    });
  } catch (error) {
    next(error);
  }
};

export const listApplicationErrorRecords = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { status, projectId, repository } = req.query;

    const errors = await listApplicationErrors({
      status: typeof status === 'string' ? status : undefined,
      projectId: typeof projectId === 'string' ? projectId : undefined,
      repository: typeof repository === 'string' ? repository : undefined,
      ownerId: req.user?.id ?? null,
    });

    res.status(200).json(errors);
  } catch (error) {
    next(error);
  }
};

export const getApplicationErrorRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const record = await findApplicationErrorById(id, req.user?.id ?? null);

    if (!record) {
      throw new AppError(`Application error with ID ${id} not found`, 404);
    }

    res.status(200).json(record);
  } catch (error) {
    next(error);
  }
};

export const resolveApplicationErrorRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const record = await resolveApplicationError(id, req.user?.id ?? null);

    if (!record) {
      throw new AppError(`Application error with ID ${id} not found`, 404);
    }

    res.status(200).json({
      success: true,
      data: record,
      message: 'Application error marked as resolved.',
    });
  } catch (error) {
    next(error);
  }
};
