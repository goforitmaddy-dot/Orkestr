import { Request, Response } from 'express';
import { checkDatabaseConnection } from '../db';
import { hasGitHubToken } from '../config/env';
import { subscriberCount } from '../services/eventBus.service';
import { listConnections } from '../services/githubConnection.service';

/**
 * Health and integration status.
 *
 * The endpoint stays public, but when a valid session is present it also
 * reports the signed-in account's own GitHub connection. That is what the
 * global header uses for its status pill, so a verified personal token is not
 * hidden behind an empty server-wide GITHUB_TOKEN. Only connection metadata is
 * returned; the token itself is never included.
 */
export const getHealth = async (req: Request, res: Response) => {
  const isDbConnected = await checkDatabaseConnection();

  let userConnection: Awaited<ReturnType<typeof listConnections>>[number] | null = null;

  if (req.user) {
    try {
      const connections = await listConnections(req.user.id);
      userConnection = connections.find((connection) => connection.provider === 'github') ?? null;
    } catch {
      // Health must still respond when the connection lookup fails.
      userConnection = null;
    }
  }

  const serverTokenConfigured = hasGitHubToken();
  const userTokenConfigured = userConnection?.status === 'valid';
  const monitoringConfigured = serverTokenConfigured || userTokenConfigured;

  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      api: 'healthy',
      database: isDbConnected ? 'connected' : 'disconnected',
      monitoring: monitoringConfigured ? 'configured' : 'unconfigured',
      liveStream: subscriberCount() > 0 ? 'active' : 'idle',
    },
    github: {
      userTokenConfigured,
      serverTokenConfigured,
      connectionStatus: userConnection?.status ?? 'none',
      accountLogin: userConnection?.account_login ?? null,
      lastValidatedAt: userConnection?.last_validated_at ?? null,
      source: userTokenConfigured ? 'user' : serverTokenConfigured ? 'server' : 'none',
    },
  });
};
