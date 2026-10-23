import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as githubService from '../services/github.service';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';

export function parseGitHubRepoCoordinates(
  rawOwner: string,
  rawName: string
): { repoOwner: string; repoName: string } {
  let owner = (rawOwner || '').trim();
  let name = (rawName || '').trim();

  // If owner is a full URL or contains a slash
  if (owner.includes('/') || owner.includes('github.com')) {
    const cleanUrl = owner
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/^\/+|\/+$/g, '');
    const parts = cleanUrl.split('/');
    if (parts.length >= 2) {
      owner = parts[0];
      name = parts[1];
    }
  }

  // If name is a full URL or contains a slash
  if (name.includes('/') || name.includes('github.com')) {
    const cleanUrl = name
      .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/^\/+|\/+$/g, '');
    const parts = cleanUrl.split('/');
    if (parts.length >= 2) {
      if (!owner || owner === parts[0]) {
        owner = parts[0];
      }
      name = parts[1];
    }
  }

  name = name.replace(/\.git$/i, '').trim();

  return { repoOwner: owner, repoName: name };
}

export function normalizeInstallationId(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;
  // If user pasted installation URL like https://github.com/settings/installations/12345678
  const match = str.match(/(\d+)\/?$/);
  if (match) return match[1];
  return str;
}

export const connectRepoSchema = z.preprocess(
  (input: any) => {
    if (!input || typeof input !== 'object') return input;
    const rawOwner = typeof input.repoOwner === 'string' ? input.repoOwner : '';
    const rawName = typeof input.repoName === 'string' ? input.repoName : '';
    const { repoOwner, repoName } = parseGitHubRepoCoordinates(rawOwner, rawName);
    const installationId = normalizeInstallationId(input.installationId);
    return {
      ...input,
      repoOwner,
      repoName,
      installationId,
    };
  },
  z.object({
    repoOwner: z
      .string()
      .trim()
      .min(1, 'Repository owner is required')
      .max(100, 'Owner name too long')
      .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository owner format'),
    repoName: z
      .string()
      .trim()
      .min(1, 'Repository name is required')
      .max(100, 'Repository name too long')
      .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid repository name format'),
    installationId: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .transform((val) => normalizeInstallationId(val))
      .refine((val) => {
        if (!val) return true;
        return /^[0-9]+$/.test(val);
      }, 'Installation ID must be a valid numeric identifier (e.g. 12345678)'),
    defaultBranch: z.string().trim().min(1).max(100).optional().default('main'),
  })
);

/**
 * GET /api/auth/github/status
 * Returns current user's GitHub linking status.
 */
export const getGitHubIdentityStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401);
    }

    const status = await githubService.getGitHubIdentityStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/github/connect
 * Initiates OAuth linking flow.
 */
export const startGitHubConnectHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) {
      throw new AppError('Authentication required to link GitHub account', 401);
    }

    let safeReturnTo: string | undefined;
    if (typeof req.query.returnTo === 'string') {
      const trimmed = req.query.returnTo.trim();
      // Only permit safe relative paths to prevent Open Redirect attacks
      if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
        safeReturnTo = trimmed;
      }
    }

    const allowTransfer = req.query.transfer === 'true';

    const { state, authUrl } = await githubService.createOAuthState(
      userId,
      safeReturnTo,
      allowTransfer
    );

    // If client requested JSON response (e.g. from single-page app or API client), return JSON
    if (
      req.query.format === 'json' ||
      (req.headers.accept && req.headers.accept.includes('application/json'))
    ) {
      res.status(200).json({ state, authUrl });
      return;
    }

    // Otherwise redirect browser to GitHub authorization URL
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/github/callback
 * Authorization callback endpoint invoked by GitHub after user consents.
 */
export const handleGitHubCallbackHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const frontendBase = config.github.frontendUrl.replace(/\/$/, '');

  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      const msg = encodeURIComponent(String(error_description || error));
      res.redirect(`${frontendBase}/settings?github=error&message=${msg}`);
      return;
    }

    if (!code || !state) {
      res.redirect(
        `${frontendBase}/settings?github=error&message=${encodeURIComponent(
          'Missing authorization code or state parameter from GitHub'
        )}`
      );
      return;
    }

    const { returnTo } = await githubService.completeGitHubOAuth(
      String(code),
      String(state)
    );

    // Prevent open redirect attacks: only allow valid relative paths on frontendBase
    let safeReturnPath = '/settings?github=success';
    if (returnTo && typeof returnTo === 'string') {
      const trimmed = returnTo.trim();
      if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
        safeReturnPath = trimmed;
      }
    }

    res.redirect(`${frontendBase}${safeReturnPath}`);
  } catch (err: any) {
    const msg = encodeURIComponent(err.message || 'GitHub linking failed');
    res.redirect(`${frontendBase}/settings?github=error&message=${msg}`);
  }
};

/**
 * DELETE /api/auth/github/disconnect
 * Unlinks GitHub identity from authenticated user.
 */
export const disconnectGitHubIdentityHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401);
    }

    const updatedUser = await githubService.unlinkGitHubIdentity(userId);
    res.status(200).json({
      success: true,
      message: 'GitHub account unlinked successfully',
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:projectId/github
 * Returns connected repository information for a project.
 */
export const getProjectGitHubStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const projectId = req.params.projectId;
    const status = await githubService.getProjectGitHubStatus(projectId);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/projects/:projectId/github/connect
 * Connects a GitHub repository to a project (OWNER or ADMIN only).
 */
export const connectProjectRepositoryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const projectId = req.params.projectId;
    const validatedInput = connectRepoSchema.parse(req.body);

    const status = await githubService.connectProjectRepository(projectId, validatedInput);
    res.status(200).json({
      success: true,
      message: 'Repository connected successfully',
      repository: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/projects/:projectId/github/disconnect
 * Disconnects the GitHub repository from a project (OWNER or ADMIN only).
 */
export const disconnectProjectRepositoryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const projectId = req.params.projectId;
    const status = await githubService.disconnectProjectRepository(projectId);
    res.status(200).json({
      success: true,
      message: 'Repository disconnected successfully',
      repository: status,
    });
  } catch (error) {
    next(error);
  }
};
