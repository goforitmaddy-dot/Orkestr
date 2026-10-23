import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  upsertServerMonitoringConfig,
  checkServerHealth,
  recordServerError,
  listServerErrors as listServerErrorsService,
  resolveServerError,
  type ServerMonitoringConfigInput,
  type ServerErrorInput,
} from '../services/serverMonitoring.service';
import { AppError } from '../middleware/errorHandler';

const uuidSchema = z.string().uuid('Invalid project ID format. Must be a valid UUID.');

const toRecord = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

const toCamelObject = (record: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const camelKey = key.replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace(/[-_]/, '')
    );
    result[camelKey] = value;
  }
  return result;
};

const mapServerHealth = (row: Record<string, unknown>): Record<string, unknown> => ({
  projectId: row.project_id,
  status: row.status,
  responseTimeMs: row.response_time_ms,
  lastCheckedAt: row.last_checked_at,
  uptimePercent: row.uptime_percent,
  lastError: row.last_error,
});

const mapServerError = (row: Record<string, unknown>): Record<string, unknown> => ({
  id: row.id,
  projectId: row.project_id,
  message: row.message,
  stackTrace: row.stack_trace,
  severity: row.severity,
  environment: row.environment,
  occurredAt: row.occurred_at,
  resolved: row.resolved,
  resolvedAt: row.resolved_at,
});

/**
 * POST /api/projects/:id/server-monitoring
 *
 * Configures live server monitoring for a project (enable/disable/configure).
 */
export const configureServerMonitoring = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const body = serverMonitoringConfigRequestSchema.parse(req.body);
    const input: ServerMonitoringConfigInput = {
      serverUrl: body.serverUrl,
      environment: body.environment,
      webhookUrl: body.webhookUrl ?? null,
      notifyTeam: body.notifyTeam ?? true,
      healthCheckIntervalMs: body.healthCheckIntervalMs ?? 30000,
      enabled: body.enabled ?? true,
    };

    const config = await upsertServerMonitoringConfig(
      parsedId.data,
      input,
      req.user?.id ?? null
    );

    res.status(200).json({
      success: true,
      message: config.enabled
        ? 'Server monitoring configured and enabled.'
        : 'Server monitoring configured and disabled.',
      data: toCamelObject(toRecord(config)),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:id/server-health
 *
 * Performs a real HTTP health check against the configured server URL and
 * returns the persisted snapshot. An unchecked server is reported as
 * 'unknown' - never fabricated as healthy.
 */
export const getServerHealth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const health = await checkServerHealth(parsedId.data, req.user?.id ?? null);
    res.status(200).json(mapServerHealth(toRecord(health)));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects/:id/server-errors
 *
 * Ingests a server error/crash reported by a running service.
 */
export const ingestServerError = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const body = serverErrorRequestSchema.parse(req.body);
    const input: ServerErrorInput = {
      message: body.message,
      stackTrace: body.stackTrace ?? null,
      severity: body.severity ?? 'medium',
      environment: body.environment ?? undefined,
    };

    const { record, created } = await recordServerError(
      parsedId.data,
      input,
      req.user?.id ?? null
    );

    res.status(created ? 201 : 200).json({
      success: true,
      created,
      data: mapServerError(toRecord(record)),
      message: created
        ? 'Server error recorded.'
        : 'Server error occurrence recorded against an existing error.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:id/server-errors
 *
 * Returns persisted server errors for the project, newest first.
 */
export const listServerErrorRecords = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const errors = await listServerErrorsService(parsedId.data, {
      status: typeof req.query.status === 'string'
        ? (req.query.status as 'open' | 'resolved' | 'all')
        : undefined,
      severity:
        typeof req.query.severity === 'string'
          ? (req.query.severity as any)
          : undefined,
      limit: Number.isFinite(limit ?? 0) ? limit : undefined,
      offset: Number.isFinite(offset ?? 0) ? offset : undefined,
      ownerId: req.user?.id ?? null,
    });

    res.status(200).json((errors as unknown as Record<string, unknown>[]).map(mapServerError));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects/:id/server-errors/:errorId/resolve
 */
export const resolveServerErrorRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      throw new AppError('Project not found', 404);
    }

    const parsedErrorId = uuidSchema.safeParse(req.params.errorId);
    if (!parsedErrorId.success) {
      throw new AppError('Server error not found', 404);
    }

    const record = await resolveServerError(
      parsedId.data,
      parsedErrorId.data,
      req.user?.id ?? null
    );

    if (!record) {
      throw new AppError(`Server error with ID ${req.params.errorId} not found`, 404);
    }

    res.status(200).json({
      success: true,
      data: mapServerError(toRecord(record)),
      message: 'Server error marked as resolved.',
    });
  } catch (error) {
    next(error);
  }
};

/* -------------------------------------------------------------------------- */
/* Request validation schemas                                                 */
/* -------------------------------------------------------------------------- */

export const serverMonitoringConfigRequestSchema = z.object({
  serverUrl: z.string().min(1, 'serverUrl is required'),
  environment: z.string().min(1, 'environment is required'),
  webhookUrl: z.string().optional().nullable(),
  notifyTeam: z.boolean().optional(),
  healthCheckIntervalMs: z.number().optional(),
  enabled: z.boolean().optional(),
});

export const serverErrorRequestSchema = z.object({
  message: z.string().min(1, 'message is required'),
  stackTrace: z.string().optional().nullable(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  environment: z.string().optional().nullable(),
});
