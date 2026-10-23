import { config, refreshGitHubCredentials } from '../config/env';

/**
 * Minimal GitHub REST API client for real-time CI monitoring.
 *
 * Uses the global `fetch` implementation (Node 18+) so the backend keeps a
 * dependency-free runtime. Only the endpoints required to detect and explain
 * workflow failures are implemented.
 */

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  node_id: string;
  head_branch: string;
  head_sha: string;
  path: string;
  run_number: number;
  run_attempt: number;
  event: string;
  status: string;
  conclusion: string | null;
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at: string;
  head_commit?: { id?: string; message?: string; timestamp?: string };
  pull_requests?: Array<{ number: number; title: string; html_url: string }>;
}

export interface GitHubJobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at?: string;
  completed_at?: string;
}

export interface GitHubJob {
  id: number;
  run_id: number;
  run_url: string;
  node_id: string;
  head_sha: string;
  url: string;
  html_url: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string;
  name: string;
  steps?: GitHubJobStep[];
  workflow_name?: string;
}

export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

export class GitHubApiError extends Error {
  public status: number;
  public rateLimit?: GitHubRateLimit;

  constructor(message: string, status: number, rateLimit?: GitHubRateLimit) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

const parseRateLimit = (headers: Headers): GitHubRateLimit | undefined => {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  if (limit === null || remaining === null || reset === null) return undefined;
  return {
    limit: Number(limit),
    remaining: Number(remaining),
    reset: Number(reset) * 1000,
  };
};

/**
 * Builds the request headers for a GitHub API call.
 *
 * `token` is the credential of the account that owns the project. When it is
 * missing the server wide token from the environment is used as a fallback.
 */
const buildHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'orkestr-monitor',
  };

  // Pick up a token that was added to the .env file after the server started.
  refreshGitHubCredentials();

  const credential = token?.trim() || config.github.token;
  if (credential) {
    headers.Authorization = `Bearer ${credential}`;
  }
  return headers;
};

/**
 * Performs an authenticated request against the GitHub REST API.
 */
const githubRequest = async <T>(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> => {
  const url = path.startsWith('http') ? path : `${config.github.apiBaseUrl}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: { ...buildHeaders(token), ...(init.headers as Record<string, string> | undefined) },
  });

  const rateLimit = parseRateLimit(response.headers);

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) detail = body.message;
    } catch {
      // Response body was not JSON; keep the status line.
    }

    if (response.status === 403 && rateLimit && rateLimit.remaining === 0) {
      const resetsIn = Math.max(0, Math.ceil((rateLimit.reset - Date.now()) / 1000));
      throw new GitHubApiError(
        `GitHub API rate limit exhausted (resets in ${resetsIn}s).`,
        response.status,
        rateLimit
      );
    }

    throw new GitHubApiError(detail, response.status, rateLimit);
  }

  return (await response.json()) as T;
};

/**
 * Splits an `owner/repo` slug into its parts.
 */
export const parseRepositorySlug = (
  repository: string
): { owner: string; name: string } | null => {
  const trimmed = repository.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  return { owner: parts[0], name: parts[1] };
};

/**
 * Lists the most recent workflow runs for a repository.
 *
 * The GitHub REST API wraps the result in a `workflow_runs` property
 * (`{ total_count, workflow_runs: [...] }`). Older proxies used to return a
 * bare array, so both shapes are accepted here; treating the object as an
 * empty list was why real repositories appeared to have no workflow runs.
 */
export const listWorkflowRuns = async (
  owner: string,
  name: string,
  options: { perPage?: number; created?: string } = {},
  token?: string
): Promise<GitHubWorkflowRun[]> => {
  const params = new URLSearchParams();
  params.set('per_page', String(options.perPage ?? config.monitoring.maxRunsPerPoll));
  if (options.created) params.set('created', options.created);

  const response = await githubRequest<
    { workflow_runs?: GitHubWorkflowRun[] } | GitHubWorkflowRun[]
  >(`/repos/${owner}/${name}/actions/runs?${params.toString()}`, {}, token);

  if (Array.isArray(response)) return response;
  return Array.isArray(response?.workflow_runs) ? response.workflow_runs : [];
};

/**
 * Lists the jobs belonging to a workflow run.
 */
export const listJobsForRun = async (
  owner: string,
  name: string,
  runId: number,
  token?: string
): Promise<GitHubJob[]> => {
  const jobs = await githubRequest<{ jobs?: GitHubJob[] }>(
    `/repos/${owner}/${name}/actions/runs/${runId}/jobs?per_page=100`,
    {},
    token
  );
  return Array.isArray(jobs?.jobs) ? jobs.jobs : [];
};

/**
 * Downloads the plain-text log for a single job.
 *
 * GitHub answers with a 302 pointing at a short-lived blob URL, so the
 * redirect is followed automatically. Returns `null` when the log is no
 * longer available (logs are retained for a limited period).
 */
export const downloadJobLog = async (
  owner: string,
  name: string,
  jobId: number,
  token?: string
): Promise<string | null> => {
  const url = `${config.github.apiBaseUrl}/repos/${owner}/${name}/actions/jobs/${jobId}/logs`;

  const response = await fetch(url, {
    headers: buildHeaders(token),
    redirect: 'follow',
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new GitHubApiError(
      `Failed to download logs for job ${jobId} (${response.status})`,
      response.status
    );
  }

  const text = await response.text();
  if (!text) return null;

  // Keep the tail of the log: failures surface at the end of a CI log and the
  // excerpt extractor falls back to the tail when no error pattern is found.
  const maxBytes = config.monitoring.maxLogBytes;
  if (Buffer.byteLength(text, 'utf-8') <= maxBytes) return text;
  return text.slice(text.length - maxBytes);
};

/**
 * Verifies a personal access token against the GitHub API.
 *
 * Used when a user connects their own token so the UI can tell them
 * immediately whether the credential works and which account it belongs to.
 */
export const verifyToken = async (
  token: string
): Promise<{
  ok: boolean;
  login: string | null;
  accountId: string | null;
  scopes: string[];
  message: string;
}> => {
  const empty = { login: null, accountId: null, scopes: [] as string[] };

  if (!token.trim()) {
    return { ...empty, ok: false, message: 'No token was provided.' };
  }

  try {
    const response = await fetch(`${config.github.apiBaseUrl}/user`, {
      headers: buildHeaders(token),
    });

    if (!response.ok) {
      const message =
        response.status === 401
          ? 'GitHub rejected this token. Check that it is valid and not expired.'
          : `GitHub returned ${response.status} ${response.statusText}.`;
      return { ...empty, ok: false, message };
    }

    const body = (await response.json()) as { login?: string; id?: number };
    const scopes = (response.headers.get('x-oauth-scopes') || '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);

    return {
      ok: true,
      login: body.login ?? null,
      accountId: body.id !== undefined ? String(body.id) : null,
      scopes,
      message: body.login
        ? `Connected as ${body.login}.`
        : 'Token is valid.',
    };
  } catch (error) {
    return {
      ...empty,
      ok: false,
      message: error instanceof Error ? error.message : 'Could not reach the GitHub API.',
    };
  }
};

/**
 * Verifies that a repository is reachable with the configured credentials.
 */
export const verifyRepositoryAccess = async (
  owner: string,
  name: string,
  token?: string
): Promise<{ ok: boolean; message: string }> => {
  try {
    await githubRequest<{ full_name: string }>(`/repos/${owner}/${name}`, {}, token);
    return { ok: true, message: 'Repository is reachable.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message };
  }
};
