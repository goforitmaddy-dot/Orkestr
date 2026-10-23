import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { verifyToken } from '../services/githubClient.service';
import {
  deleteConnection,
  listConnections,
  saveConnection,
  updateConnectionStatus,
} from '../services/githubConnection.service';

/**
 * GitHub connection endpoints.
 *
 * Every user manages their own personal access token. Tokens are encrypted
 * before they are stored and are never returned to the browser.
 */

export const connectionSchema = z.object({
  token: z
    .string({ required_error: 'A GitHub token is required' })
    .trim()
    .min(10, 'That does not look like a GitHub token.'),
  provider: z.string().trim().optional().default('github'),
});

const publicConnection = (connection: {
  id: string;
  provider: string;
  account_login: string | null;
  token_hint: string;
  scopes: string[];
  status: string;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
}) => ({
  id: connection.id,
  provider: connection.provider,
  accountLogin: connection.account_login,
  tokenHint: connection.token_hint,
  scopes: connection.scopes,
  status: connection.status,
  lastValidatedAt: connection.last_validated_at,
  lastError: connection.last_error,
  createdAt: connection.created_at,
});

export const listUserConnections = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new AppError('Authentication required.', 401);

    const connections = await listConnections(req.user.id);

    res.status(200).json({
      success: true,
      data: connections.map(publicConnection),
    });
  } catch (error) {
    next(error);
  }
};

export const createUserConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new AppError('Authentication required.', 401);

    const data = connectionSchema.parse(req.body);
    const provider = data.provider || 'github';

    // Validate before storing so the user gets immediate feedback.
    const verification = await verifyToken(data.token);

    const connection = await saveConnection({
      userId: req.user.id,
      provider,
      token: data.token,
      accountLogin: verification.login,
      accountId: verification.accountId,
      scopes: verification.scopes,
      status: verification.ok ? 'valid' : 'invalid',
      lastError: verification.ok ? null : verification.message,
    });

    res.status(verification.ok ? 201 : 400).json({
      success: verification.ok,
      data: { connection: publicConnection(connection) },
      message: verification.ok
        ? verification.message
        : verification.message,
    });
  } catch (error) {
    next(error);
  }
};

export const validateUserConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new AppError('Authentication required.', 401);

    const connections = await listConnections(req.user.id);
    const target = connections.find((connection) => connection.id === req.params.id);

    if (!target) {
      throw new AppError('GitHub connection not found.', 404);
    }

    res.status(200).json({
      success: true,
      data: { connection: publicConnection(target) },
      message:
        target.status === 'valid'
          ? 'This connection was verified successfully.'
          : 'This connection has not been verified yet.',
    });
  } catch (error) {
    next(error);
  }
};

export const removeUserConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new AppError('Authentication required.', 401);

    const removed = await deleteConnection(req.user.id, req.params.id);
    if (!removed) {
      throw new AppError('GitHub connection not found.', 404);
    }

    res.status(200).json({ success: true, message: 'GitHub connection removed.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Re-checks a stored token against the GitHub API.
 */
export const revalidateUserConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw new AppError('Authentication required.', 401);

    const { getConnectionWithToken } = await import('../services/githubConnection.service');
    const stored = await getConnectionWithToken(req.user.id, 'github');

    if (!stored) {
      throw new AppError('GitHub connection not found.', 404);
    }

    const verification = await verifyToken(stored.token);
    const updated = await updateConnectionStatus(stored.id, verification.ok ? 'valid' : 'invalid', {
      accountLogin: verification.login,
      accountId: verification.accountId,
      scopes: verification.scopes,
      error: verification.ok ? null : verification.message,
    });

    res.status(200).json({
      success: verification.ok,
      data: updated ? { connection: publicConnection(updated) } : null,
      message: verification.message,
    });
  } catch (error) {
    next(error);
  }
};
