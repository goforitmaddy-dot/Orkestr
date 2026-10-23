import { config, refreshGitHubCredentials } from '../config/env';
import { query } from '../db';
import { normalizeGitHubPayload } from './normalizer.service';
import { correlateMonitoringRecord } from './incidentCorrelation.service';
import { hasProcessedDelivery } from './deduplicator.service';
import {
  downloadJobLog,
  GitHubApiError,
  GitHubJob,
  GitHubWorkflowRun,
  listJobsForRun,
  listWorkflowRuns,
  parseRepositorySlug,
} from './githubClient.service';
import { publish } from './eventBus.service';
import { getConnectionWithToken } from './githubConnection.service';

/**
 * Real-time CI monitoring.
 *
 * Polls the GitHub REST API for workflow activity on every monitored project
 * and feeds genuine failures through the normalise -> deduplicate ->
 * correlate pipeline. Nothing is fabricated: every incident originates from a
 * workflow run that actually failed, and the log excerpt is the real job log
 * downloaded from GitHub.
 */

const PROVIDER = 'github';
const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled']);
const SUCCESS_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

interface MonitoredProject {
  id: string;
  name: string;
  provider: string;
  repository: string | null;
  owner_id: string | null;
}

export interface PollIssue {
  projectId: string;
  repository: string;
  message: string;
  status?: number;
}

export interface PollTargetResult {
  projectId: string;
  projectName: string;
  repository: string;
  workflowRunsInspected: number;
  failedRunsFound: number;
  failuresDetected: number;
  recoveriesDetected: number;
  error: string | null;
}

export interface PollCycleResult {
  ranAt: string;
  ownerId: string | null;
  projectsPolled: number;
  repositoriesChecked: string[];
  /** Workflow runs returned by the GitHub API and inspected this cycle. */
  workflowRunsInspected: number;
  /** Runs whose conclusion is failure/timed_out/cancelled. */
  failedRunsFound: number;
  failuresDetected: number;
  recoveriesDetected: number;
  errors: PollIssue[];
  /** Only errors that came from the GitHub API itself. */
  githubApiErrors: PollIssue[];
  targets: PollTargetResult[];
  /** Retained for clients built against the previous response shape. */
  runsScanned: number;
  skipped: boolean;
  skipReason: string | null;
}

let cycleInProgress = false;
let timer: NodeJS.Timeout | null = null;

/**
 * Loads every project that has monitoring enabled and a repository attached.
 *
 * The background poller passes no owner filter so it covers every account.
 * A user-triggered poll passes the signed-in account so it can only touch that
 * account's projects (plus legacy unowned projects that it can still see).
 */
const loadMonitoredProjects = async (ownerId?: string | null): Promise<MonitoredProject[]> => {
  const sql = ownerId
    ? `SELECT id, name, provider, repository, owner_id
       FROM projects
       WHERE monitoring_enabled = TRUE AND repository IS NOT NULL
         AND (owner_id = $1 OR owner_id IS NULL)
       ORDER BY created_at ASC;`
    : `SELECT id, name, provider, repository, owner_id
       FROM projects
       WHERE monitoring_enabled = TRUE AND repository IS NOT NULL
       ORDER BY created_at ASC;`;

  const result = ownerId
    ? await query<MonitoredProject>(sql, [ownerId])
    : await query<MonitoredProject>(sql);
  return result.rows;
};

/**
 * Resolves the credential used to poll a project.
 *
 * The token of the account that owns the project is preferred. Projects
 * without an owner (or owners without a connection) fall back to the server
 * wide token from the environment.
 */
const resolveProjectToken = async (
  project: MonitoredProject,
  fallbackToken?: string | null
): Promise<string | null> => {
  if (project.owner_id) {
    const connection = await getConnectionWithToken(project.owner_id, PROVIDER);
    if (connection?.token && connection.status === 'valid') return connection.token;
  }

  // A manual poll carries the signed-in account's verified token. It is only
  // used for legacy projects without an owner; owned projects always prefer
  // their own account's connection above.
  if (!project.owner_id && fallbackToken) return fallbackToken;

  refreshGitHubCredentials();
  return config.github.token || null;
};

/**
 * Records the outcome of a poll cycle for a target.
 */
const recordMonitoringState = async (
  target: string,
  runsScanned: number,
  failedRunsFound: number,
  failuresDetected: number,
  errorMessage: string | null
): Promise<void> => {
  try {
    await query(
      `INSERT INTO monitoring_state (provider, target, last_run_at, last_success_at, last_error, runs_scanned, failed_runs, failures_detected)
       VALUES ($1, $2, NOW(), CASE WHEN $5::TEXT IS NULL THEN NOW() ELSE NULL END, $5, $3, $4, $6)
       ON CONFLICT (provider, target) DO UPDATE SET
         last_run_at = NOW(),
         last_success_at = CASE WHEN $5::TEXT IS NULL THEN NOW() ELSE monitoring_state.last_success_at END,
         last_error = $5,
         runs_scanned = $3,
         failed_runs = $4,
         failures_detected = $6;`,
      [PROVIDER, target, runsScanned, failedRunsFound, errorMessage, failuresDetected]
    );
  } catch (error) {
    console.error('Failed to persist monitoring state:', (error as Error).message);
  }
};

/**
 * Builds a human-readable, non-fabricated description of a polling failure.
 */
const describePollError = (error: unknown): { message: string; status?: number } => {
  if (error instanceof GitHubApiError) {
    let message = error.message;

    if (error.status === 401) {
      message = `${message} The saved GitHub token was rejected (401). Re-verify it in Settings.`;
    } else if (error.status === 403 && !error.rateLimit) {
      message = `${message} The token may be missing Actions: read / Metadata: read permission, or access to this repository.`;
    } else if (error.status === 404) {
      message = `${message} Check that the repository exists and the token can access its Actions.`;
    }

    return { message, status: error.status };
  }

  return {
    message: error instanceof Error ? error.message : 'Unknown polling error',
  };
};

/**
 * Ingests a failed workflow run.
 */
const ingestFailedRun = async (
  owner: string,
  name: string,
  run: GitHubWorkflowRun,
  jobs: GitHubJob[],
  token?: string
): Promise<number> => {
  const failedJobs = jobs.filter(
    (job) => job.conclusion && FAILURE_CONCLUSIONS.has(job.conclusion)
  );

  let detected = 0;

  for (const job of failedJobs) {
    const deliveryId = `github-poll-job-${run.id}-${run.run_attempt}-${job.id}`;

    // The run marker is checked before the job marker so an already-analysed
    // run costs nothing beyond the runs listing.
    if (await hasProcessedDelivery(PROVIDER, deliveryId)) continue;

    let logs: string | null = null;
    try {
      logs = await downloadJobLog(owner, name, job.id, token);
    } catch (error) {
      console.error(
        `Failed to download logs for ${owner}/${name} job ${job.id}:`,
        (error as Error).message
      );
    }

    const payload = {
      action: 'completed',
      workflow_job: {
        id: job.id,
        run_id: run.id,
        workflow_name: job.workflow_name || run.name,
        name: job.name,
        head_branch: run.head_branch,
        head_sha: run.head_sha,
        run_attempt: run.run_attempt,
        status: job.status,
        conclusion: job.conclusion,
        started_at: job.started_at,
        completed_at: job.completed_at,
        html_url: job.html_url,
        steps: job.steps || [],
      },
      repository: {
        name,
        full_name: `${owner}/${name}`,
        html_url: `https://github.com/${owner}/${name}`,
      },
      pull_requests: run.pull_requests || [],
      raw_logs: logs,
    };

    const record = normalizeGitHubPayload(payload, {
      'x-github-delivery': deliveryId,
      'x-github-event': 'workflow_job',
    });

    await correlateMonitoringRecord(record, payload);
    detected += 1;
  }

  return detected;
};

/**
 * Ingests a successful run so any open incident for the same
 * repository/workflow/branch is marked as recovered.
 */
const ingestRecoveredRun = async (
  owner: string,
  name: string,
  run: GitHubWorkflowRun
): Promise<boolean> => {
  const branch = run.head_branch || 'default';
  const incidentKey = `${PROVIDER}:${owner}/${name}:${run.name}:${branch}`;

  // Only emit a recovery event when there is something to recover.
  const active = await query<{ id: string }>(
    `SELECT id FROM incidents
     WHERE incident_key = $1 AND status IN ('OPEN', 'INVESTIGATING')
     LIMIT 1;`,
    [incidentKey]
  );
  if (active.rows.length === 0) return false;

  const deliveryId = `github-poll-recovery-${run.id}-${run.run_attempt}`;
  if (await hasProcessedDelivery(PROVIDER, deliveryId)) return false;

  const payload = {
    action: 'completed',
    workflow_run: {
      id: run.id,
      name: run.name,
      head_branch: run.head_branch,
      head_sha: run.head_sha,
      run_attempt: run.run_attempt,
      status: run.status,
      conclusion: run.conclusion,
      created_at: run.created_at,
      updated_at: run.updated_at,
      run_started_at: run.run_started_at,
      html_url: run.html_url,
      pull_requests: run.pull_requests || [],
    },
    repository: {
      name,
      full_name: `${owner}/${name}`,
      html_url: `https://github.com/${owner}/${name}`,
    },
  };

  const record = normalizeGitHubPayload(payload, {
    'x-github-delivery': deliveryId,
    'x-github-event': 'workflow_run',
  });

  await correlateMonitoringRecord(record, payload);
  return true;
};

/**
 * Scans a single repository for new failures.
 */
const pollRepository = async (
  project: MonitoredProject,
  owner: string,
  name: string,
  token?: string
): Promise<{
  runsScanned: number;
  failedRunsFound: number;
  failures: number;
  recoveries: number;
  error: string | null;
}> => {
  let runsScanned = 0;
  let failedRunsFound = 0;
  let failures = 0;
  let recoveries = 0;

  const runs = await listWorkflowRuns(owner, name, {}, token);
  runsScanned = runs.length;

  for (const run of runs) {
    if (!run.conclusion) continue;

    if (FAILURE_CONCLUSIONS.has(run.conclusion)) failedRunsFound += 1;

    const runMarker = `github-poll-run-${run.id}-${run.run_attempt}`;
    const alreadySeen = await hasProcessedDelivery(PROVIDER, runMarker);

    if (FAILURE_CONCLUSIONS.has(run.conclusion)) {
      if (alreadySeen) continue;

      // A failure cannot be processed without its jobs. If GitHub rejects the
      // jobs request, surface the real API error instead of silently treating
      // the run as clean.
      const jobs = await listJobsForRun(owner, name, run.id, token);

      failures += await ingestFailedRun(owner, name, run, jobs, token);

      // Mark the run as handled so the next cycle does not re-fetch it.
      await markDeliveryProcessed(runMarker, 'workflow_run', run.conclusion, {
        id: run.id,
        run_attempt: run.run_attempt,
      });
      continue;
    }

    if (SUCCESS_CONCLUSIONS.has(run.conclusion)) {
      if (alreadySeen) continue;

      const recovered = await ingestRecoveredRun(owner, name, run);
      if (recovered) recoveries += 1;

      await markDeliveryProcessed(runMarker, 'workflow_run', run.conclusion, {
        id: run.id,
        run_attempt: run.run_attempt,
      });
    }
  }

  return { runsScanned, failedRunsFound, failures, recoveries, error: null };
};

/**
 * Records a delivery marker without correlating a workflow run.
 */
const markDeliveryProcessed = async (
  deliveryId: string,
  eventType: string,
  conclusion: string | null,
  payload: Record<string, unknown>
): Promise<void> => {
  try {
    await query(
      `INSERT INTO webhook_events (provider, delivery_id, event_type, action, payload, status)
       VALUES ($1, $2, $3, $4, $5, 'PROCESSED')
       ON CONFLICT (delivery_id) DO NOTHING;`,
      [PROVIDER, deliveryId, eventType, conclusion, JSON.stringify(payload)]
    );
  } catch (error) {
    console.error('Failed to record delivery marker:', (error as Error).message);
  }
};

/**
 * Runs a single monitoring cycle across every enabled project.
 *
 * When `ownerId` is supplied only that account's projects are polled. A manual
 * poll also passes that account's verified token so legacy unowned projects do
 * not silently fall back to an empty server token.
 */
export const pollOnce = async (
  options: { ownerId?: string | null; fallbackToken?: string | null } = {}
): Promise<PollCycleResult> => {
  const result: PollCycleResult = {
    ranAt: new Date().toISOString(),
    ownerId: options.ownerId ?? null,
    projectsPolled: 0,
    repositoriesChecked: [],
    workflowRunsInspected: 0,
    failedRunsFound: 0,
    failuresDetected: 0,
    recoveriesDetected: 0,
    errors: [],
    githubApiErrors: [],
    targets: [],
    runsScanned: 0,
    skipped: false,
    skipReason: null,
  };

  if (cycleInProgress) {
    console.debug('Monitoring cycle already in progress; skipping this tick.');
    result.skipped = true;
    result.skipReason = 'A monitoring cycle is already in progress.';
    return result;
  }

  cycleInProgress = true;
  try {
    const projects = await loadMonitoredProjects(options.ownerId);

    for (const project of projects) {
      const slug = parseRepositorySlug(project.repository || '');
      if (!slug) {
        const message = 'Repository must be in "owner/repo" format.';
        result.errors.push({
          projectId: project.id,
          repository: project.repository || '',
          message,
        });
        result.targets.push({
          projectId: project.id,
          projectName: project.name,
          repository: project.repository || '',
          workflowRunsInspected: 0,
          failedRunsFound: 0,
          failuresDetected: 0,
          recoveriesDetected: 0,
          error: message,
        });
        await query(
          `UPDATE projects SET last_polled_at = NOW(), last_poll_error = $2 WHERE id = $1;`,
          [project.id, message]
        );
        continue;
      }

      const repository = `${slug.owner}/${slug.name}`;
      result.projectsPolled += 1;
      if (!result.repositoriesChecked.includes(repository)) {
        result.repositoriesChecked.push(repository);
      }

      const token = await resolveProjectToken(project, options.fallbackToken);

      if (!token) {
        const message =
          'No GitHub token available. Add a personal access token in Settings > GitHub, or set GITHUB_TOKEN on the server.';
        result.errors.push({
          projectId: project.id,
          repository,
          message,
        });
        result.targets.push({
          projectId: project.id,
          projectName: project.name,
          repository,
          workflowRunsInspected: 0,
          failedRunsFound: 0,
          failuresDetected: 0,
          recoveriesDetected: 0,
          error: message,
        });
        await query(
          `UPDATE projects SET last_polled_at = NOW(), last_poll_error = $2 WHERE id = $1;`,
          [project.id, message]
        );
        await recordMonitoringState(repository, 0, 0, 0, message);
        continue;
      }

      try {
        const outcome = await pollRepository(project, slug.owner, slug.name, token);
        result.runsScanned += outcome.runsScanned;
        result.workflowRunsInspected += outcome.runsScanned;
        result.failedRunsFound += outcome.failedRunsFound;
        result.failuresDetected += outcome.failures;
        result.recoveriesDetected += outcome.recoveries;

        result.targets.push({
          projectId: project.id,
          projectName: project.name,
          repository,
          workflowRunsInspected: outcome.runsScanned,
          failedRunsFound: outcome.failedRunsFound,
          failuresDetected: outcome.failures,
          recoveriesDetected: outcome.recoveries,
          error: null,
        });

        await query(
          `UPDATE projects SET last_polled_at = NOW(), last_poll_error = NULL WHERE id = $1;`,
          [project.id]
        );
        await recordMonitoringState(
          repository,
          outcome.runsScanned,
          outcome.failedRunsFound,
          outcome.failures,
          null
        );
      } catch (error) {
        const described = describePollError(error);
        console.error(`Polling failed for ${repository}:`, described.message);

        const issue: PollIssue = {
          projectId: project.id,
          repository,
          message: described.message,
          ...(described.status !== undefined ? { status: described.status } : {}),
        };
        result.errors.push(issue);

        if (error instanceof GitHubApiError) {
          result.githubApiErrors.push(issue);
        }

        result.targets.push({
          projectId: project.id,
          projectName: project.name,
          repository,
          workflowRunsInspected: 0,
          failedRunsFound: 0,
          failuresDetected: 0,
          recoveriesDetected: 0,
          error: described.message,
        });

        await query(
          `UPDATE projects SET last_polled_at = NOW(), last_poll_error = $2 WHERE id = $1;`,
          [project.id, described.message]
        );
        await recordMonitoringState(repository, 0, 0, 0, described.message);
      }
    }

    publish('monitoring.status', {
      ranAt: result.ranAt,
      ownerId: result.ownerId,
      projectsPolled: result.projectsPolled,
      repositoriesChecked: result.repositoriesChecked,
      workflowRunsInspected: result.workflowRunsInspected,
      failedRunsFound: result.failedRunsFound,
      runsScanned: result.runsScanned,
      failuresDetected: result.failuresDetected,
      recoveriesDetected: result.recoveriesDetected,
      errorCount: result.errors.length,
      githubApiErrorCount: result.githubApiErrors.length,
    });

    return result;
  } finally {
    cycleInProgress = false;
  }
};

/**
 * Starts the background polling loop.
 */
export const startCiMonitor = (): void => {
  if (!config.monitoring.enabled) {
    console.log('⏸️  CI monitoring disabled (MONITORING_ENABLED=false).');
    return;
  }

  refreshGitHubCredentials();

  if (!config.github.token) {
    console.warn(
      '⚠️  GITHUB_TOKEN is not set - CI monitoring will not be able to reach the GitHub API.'
    );
  }

  const interval = Math.max(5000, config.monitoring.pollIntervalMs);

  const runCycle = async () => {
    try {
      const outcome = await pollOnce();
      if (outcome.failuresDetected > 0 || outcome.recoveriesDetected > 0) {
        console.log(
          `🔎 Monitoring cycle: ${outcome.failuresDetected} failure(s), ${outcome.recoveriesDetected} recovery/recoveries detected.`
        );
      }
    } catch (error) {
      console.error('Monitoring cycle failed:', (error as Error).message);
    }
  };

  // Delay the first cycle slightly so server startup is not blocked.
  setTimeout(runCycle, 2000);
  timer = setInterval(runCycle, interval);

  console.log(`📡 CI monitoring started (every ${Math.round(interval / 1000)}s).`);
};

/**
 * Stops the background polling loop.
 */
export const stopCiMonitor = (): void => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('🛑 CI monitoring stopped.');
  }
};
