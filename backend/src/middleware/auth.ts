import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { resolveSession, AuthUser } from '../services/auth.service';

/**
 * Session authentication.
 *
 * The session token is read from the `orkestr_session` cookie, or from an
 * `Authorization: Bearer <token>` header for service-to-service calls.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

const parseCookies = (req: Request): Record<string, string> => {
  const header = req.headers.cookie;
  if (!header) return {};

  const cookies: Record<string, string> = {};

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
};

const readToken = (req: Request): string | null => {
  const cookies = parseCookies(req);

  if (cookies[config.auth.cookieName]) {
    return cookies[config.auth.cookieName];
  }

  const header = req.headers.authorization;
  if (header && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }

  return null;
};

/**
 * Attaches the current user when a valid session is present, but never
 * rejects the request.
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = readToken(req);
    if (!token) {
      next();
      return;
    }

    const user = await resolveSession(token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  } catch {
    // A broken session must never block the request.
  }

  next();
};

/**
 * Rejects the request when no valid session is present.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = readToken(req);
    if (!token) {
      res.status(401).json({
        error: { message: 'Authentication required.', statusCode: 401 },
      });
      return;
    }

    const user = await resolveSession(token);
    if (!user) {
      res.status(401).json({
        error: { message: 'Your session has expired. Please sign in again.', statusCode: 401 },
      });
      return;
    }

    req.user = user;
    req.sessionToken = token;
    next();
  } catch (error) {
    next(error);
  }
};
