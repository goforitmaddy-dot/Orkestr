import { Request, Response, NextFunction } from 'express';
import { config, hasGitHubToken } from '../config/env';
import { query } from '../db';
import { subscriberCount } from '../services/eventBus.service';
import { pollOnce } from '../services/ciMonitor.service';
import {
  getConnectionWithToken,
  listConnections,
} from '../services/githubConnection.service';

/**
 * Monitoring Controller
 *
 * Exposes the operational state of the real-time monitoring pipeline so the
 * UI can honestly report what is connected and what is being watched.
 */

interface MonitoringStateRow {
  target: string;
  last_success_at: string | null;
  last_error: string | null;
  runs_scanned: number | null;
  failed_runs: number | null;
  failures_detected: number | null;
}

export const getMonitoringStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ownerId = req.user?.id ?? null;

    const projects = await query<{
      id: string;
      name: string;
      repository: string | null;
      monitoring_enabled: boolean;
      last_polled_at: string | null;
      last_poll_error: string | null;
    }>(
      `SELECT id, name, repository, monitoring_enabled, last_polled_at, last_poll_error
       FROM projects
       WHERE repository IS NOT NULL
         AND ($1::UUID IS NULL OR owner_id = $1 OR owner_id IS NULL)
       ORDER BY created_at ASC;`,
      ownerId ? [ownerId] : []
    );

    const repositories = projects.rows
      .map((project) => project.repository)
      .filter((repository): repository is string => Boolean(repository));

    const states = repositories.length
      ? await query<MonitoringStateRow>(
          `SELECT target, last_success_at, last_error, runs_scanned, failed_runs, failures_detected
           FROM monitoring_state
           WHERE provider = 'github' AND target = ANY($1::TEXT[]);`,
          [repositories]
        )
      : { rows: [] as MonitoringStateRow[] };

    const stateByTarget = new Map(
      states.rows.map((state) => [state.target, state])
    );

    const lastCycle = repositories.length
      ? await query<{
          last_run_at: string | null;
          last_success_at: string | null;
          last_error: string | null;
          runs_scanned: number | null;
          failed_runs: number | null;
          failures_detected: number | null;
        }>(
          `SELECT MAX(last_run_at) AS last_run_at,
                  MAX(last_success_at) AS last_success_at,
                  MAX(last_error) AS last_error,
                  SUM(runs_scanned) AS runs_scanned,
                  SUM(failed_runs) AS failed_runs,
                  SUM(failures_detected) AS failures_detected
           FROM monitoring_state
           WHERE provider = 'github' AND target = ANY($1::TEXT[]);`,
          [repositories]
        )
      : {
          rows: [
            {
              last_run_at: null,
              last_success_at: null,
              last_error: null,
              runs_scanned: null,
              failed_runs: null,
              failures_detected: null,
            },
          ],
        };

    const connections = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count
       FROM github_connections
       WHERE ($1::UUID IS NULL OR user_id = $1)
       GROUP BY status;`,
      [ownerId]
    );

    const userConnection = ownerId ? (await listConnections(ownerId))[0] ?? null : null;
    const monitored = projects.rows.filter((p) => p.monitoring_enabled);

    const connectionCount = (status: string): number =>
      Number(connections.rows.find((row) => row.status === status)?.count || 0);

    res.status(200).json({
      enabled: config.monitoring.enabled,
      provider: 'github',
      credentialsConfigured: hasGitHubToken() || connectionCount('valid') > 0,
      serverTokenConfigured: hasGitHubToken(),
      userConnections: {
        total: connections.rows.reduce((sum, row) => sum + Number(row.count || 0), 0),
        valid: connectionCount('valid'),
        invalid: connectionCount('invalid'),
      },
      userConnection: userConnection
        ? {
            provider: userConnection.provider,
            accountLogin: userConnection.account_login,
            tokenHint: userConnection.token_hint,
            scopes: userConnection.scopes,
            status: userConnection.status,
            lastValidatedAt: userConnection.last_validated_at,
            lastError: userConnection.last_error,
          }
        : null,
      pollIntervalMs: config.monitoring.pollIntervalMs,
      monitoredProjectCount: monitored.length,
      linkedProjectCount: projects.rows.length,
      streamSubscribers: subscriberCount(),
      lastCycle: lastCycle.rows[0] || null,
      targets: projects.rows.map((project) => {
        const state = project.repository ? stateByTarget.get(project.repository) : undefined;

        return {
          projectId: project.id,
          projectName: project.name,
          repository: project.repository,
          monitoringEnabled: project.monitoring_enabled,
          lastPolledAt: project.last_polled_at,
          lastSuccessAt: state?.last_success_at ?? null,
          workflowRunsInspected: Number(state?.runs_scanned || 0),
          failedRunsFound: Number(state?.failed_runs || 0),
          failuresDetected: Number(state?.failures_detected || 0),
          lastError: project.last_poll_error ?? state?.last_error ?? null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Combined error summary used by the dashboard and header.
 */
export const getMonitoringSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ownerId = req.user?.id ?? null;

    const incidents = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM incidents
       WHERE status IN ('OPEN', 'INVESTIGATING')
         AND ($1::UUID IS NULL OR owner_id = $1 OR owner_id IS NULL);`,
      [ownerId]
    );
    const recoveredIncidents = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM incidents
       WHERE status IN ('RECOVERED', 'RESOLVED')
         AND ($1::UUID IS NULL OR owner_id = $1 OR owner_id IS NULL);`,
      [ownerId]
    );
    const runtimeErrors = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM application_errors
       WHERE status = 'OPEN'
         AND ($1::UUID IS NULL OR owner_id = $1 OR owner_id IS NULL);`,
      [ownerId]
    );
    const resolvedRuntimeErrors = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM application_errors
       WHERE status = 'RESOLVED'
         AND ($1::UUID IS NULL OR owner_id = $1 OR owner_id IS NULL);`,
      [ownerId]
    );

    const activeIncidents = Number(incidents.rows[0]?.count || 0);
    const activeRuntimeErrors = Number(runtimeErrors.rows[0]?.count || 0);

    res.status(200).json({
      activeIncidents,
      recoveredIncidents: Number(recoveredIncidents.rows[0]?.count || 0),
      activeRuntimeErrors,
      resolvedRuntimeErrors: Number(resolvedRuntimeErrors.rows[0]?.count || 0),
      totalActiveErrors: activeIncidents + activeRuntimeErrors,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Triggers an immediate monitoring cycle instead of waiting for the next tick.
 *
 * The cycle is scoped to the signed-in account and uses that account's saved,
 * verified connection. A failed or partial cycle is reported as unsuccessful
 * instead of being presented as a clean run.
 */
export const triggerPoll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ownerId = req.user?.id;

    if (!ownerId) {
      res.status(401).json({
        error: { message: 'Authentication required.', statusCode: 401 },
      });
      return;
    }

    const connection = await getConnectionWithToken(ownerId, 'github');
    const userToken = connection?.status === 'valid' ? connection.token : null;

    if (!hasGitHubToken() && !userToken) {
      res.status(200).json({
        success: false,
        message:
          'No verified GitHub token is available. Connect and verify a personal token in Settings, or set GITHUB_TOKEN on the server.',
        data: null,
      });
      return;
    }

    const result = await pollOnce({ ownerId, fallbackToken: userToken });

    const success = !result.skipped && result.errors.length === 0;
    const summary = `${result.workflowRunsInspected} workflow run(s) inspected across ${result.repositoriesChecked.length} repositor${
      result.repositoriesChecked.length === 1 ? 'y' : 'ies'
    }; ${result.failedRunsFound} failed run(s) found; ${result.failuresDetected} failure(s) recorded.`;

    let message: string;
    if (result.skipped) {
      message = `Monitoring cycle was skipped: ${result.skipReason}`;
    } else if (!success) {
      const details = result.errors
        .map((issue) => `${issue.repository}: ${issue.message}`)
        .join(' | ');
      message = `Monitoring cycle finished with ${result.errors.length} error(s). ${summary} ${details}`;
    } else if (result.repositoriesChecked.length === 0) {
      message =
        'No monitored repositories were found for your account. Link a repository and enable monitoring in Projects.';
    } else {
      message = `Monitoring cycle complete: ${summary}`;
    }

    res.status(200).json({
      success,
      message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
