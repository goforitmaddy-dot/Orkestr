import crypto from 'crypto';
import { query } from '../db';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { PublicUser, UserRecord } from '../types/auth';
import { sanitizeUser } from './auth.service';

export interface GitHubIdentityStatus {
  isConfigured: boolean;
  isLinked: boolean;
  githubUserId: string | null;
  githubUsername: string | null;
  linkedAt: string | null;
}

export interface ProjectGitHubStatus {
  isConfigured: boolean;
  isConnected: boolean;
  repoId: string | null;
  repoOwner: string | null;
  repoName: string | null;
  fullName: string | null;
  defaultBranch: string | null;
  installationId: string | null;
  connectionStatus: string;
  connectedAt: string | null;
}

export interface ConnectRepositoryInput {
  repoOwner: string;
  repoName: string;
  installationId?: number | string | null;
  repoId?: number | string | null;
  defaultBranch?: string | null;
}

export interface GitHubUserProfile {
  id: number;
  login: string;
  email?: string | null;
}

export interface VerifiedRepository {
  repoId: number;
  repoOwner: string;
  repoName: string;
  fullName: string;
  defaultBranch: string;
  permissions?: {
    pull?: boolean;
    push?: boolean;
    admin?: boolean;
  };
}

export interface ChangedFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  isTruncated?: boolean;
  isBinary?: boolean;
  previousFilename?: string;
}

export interface ActivityCodeDiff {
  identifier: string;
  activityType: 'COMMIT' | 'PULL_REQUEST';
  title: string;
  messageOrBody?: string;
  url: string;
  files: ChangedFile[];
  stats: {
    totalFiles: number;
    additions: number;
    deletions: number;
    totalChanges: number;
  };
  limitations: string[];
}

// Internal provider function references for testing/mocking
export interface GitHubApiTransport {
  exchangeCode: (code: string, redirectUri: string) => Promise<string>;
  fetchProfile: (accessToken: string) => Promise<GitHubUserProfile>;
  verifyRepositoryAccess: (
    installationId: number | string | null | undefined,
    repoOwner: string,
    repoName: string
  ) => Promise<VerifiedRepository>;
  fetchCommitChanges: (owner: string, repo: string, sha: string) => Promise<ActivityCodeDiff>;
  fetchPullRequestChanges: (owner: string, repo: string, prNumber: number) => Promise<ActivityCodeDiff>;
}

const defaultTransport: GitHubApiTransport = {
  exchangeCode: async (code: string, redirectUri: string): Promise<string> => {
    if (!config.github.clientId || !config.github.clientSecret) {
      throw new AppError('GitHub App client credentials are not configured on the server', 503);
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new AppError(`GitHub token exchange failed: HTTP ${response.status}`, 502);
    }

    const data: any = await response.json();
    if (data.error) {
      throw new AppError(`GitHub authorization failed: ${data.error_description || data.error}`, 400);
    }

    if (!data.access_token) {
      throw new AppError('No access token returned from GitHub authorization', 502);
    }

    return data.access_token;
  },

  fetchProfile: async (accessToken: string): Promise<GitHubUserProfile> => {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Orkestr-App',
      },
    });

    if (!response.ok) {
      throw new AppError(`Failed to fetch GitHub profile: HTTP ${response.status}`, 502);
    }

    const data: any = await response.json();
    if (!data.id || !data.login) {
      throw new AppError('Invalid user profile response received from GitHub', 502);
    }

    return {
      id: data.id,
      login: data.login,
      email: data.email || null,
    };
  },

  verifyRepositoryAccess: async (
    installationId: number | string | null | undefined,
    repoOwner: string,
    repoName: string
  ): Promise<VerifiedRepository> => {
    if (!config.github.clientId || !config.github.clientSecret) {
      throw new AppError(
        'GitHub App credentials are not configured on this server. Repository verification requires GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET.',
        503
      );
    }

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Orkestr-App',
        },
      }
    );

    if (response.status === 404) {
      const instSuffix = installationId
        ? ` or is not accessible to GitHub App installation ${installationId}`
        : '';
      throw new AppError(
        `Repository ${repoOwner}/${repoName} was not found${instSuffix}`,
        404
      );
    }

    if (response.status === 403) {
      const instSuffix = installationId
        ? `GitHub App installation ${installationId} is inaccessible, revoked, or lacks permission`
        : 'Access forbidden or rate limited';
      throw new AppError(
        `${instSuffix} for ${repoOwner}/${repoName}`,
        403
      );
    }

    if (!response.ok) {
      throw new AppError(`GitHub repository verification failed: HTTP ${response.status}`, 502);
    }

    const data: any = await response.json();
    return {
      repoId: data.id,
      repoOwner: data.owner?.login || repoOwner,
      repoName: data.name || repoName,
      fullName: data.full_name || `${repoOwner}/${repoName}`,
      defaultBranch: data.default_branch || 'main',
      permissions: data.permissions,
    };
  },

  fetchCommitChanges: async (owner: string, repo: string, sha: string): Promise<ActivityCodeDiff> => {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Orkestr-App',
        },
      }
    );

    if (response.status === 404) {
      throw new AppError(`Commit ${sha} was not found in ${owner}/${repo}`, 404);
    }
    if (response.status === 403) {
      throw new AppError(`GitHub API rate limit exceeded or access forbidden for ${owner}/${repo}`, 403);
    }
    if (!response.ok) {
      throw new AppError(`Failed to fetch commit from GitHub: HTTP ${response.status}`, 502);
    }

    const data: any = await response.json();
    const commitMessage = data.commit?.message || '';
    const title = commitMessage.split('\n')[0] || `Commit ${sha.slice(0, 7)}`;
    const htmlUrl = data.html_url || `https://github.com/${owner}/${repo}/commit/${sha}`;

    const { files, stats, limitations } = sanitizeAndTruncateFiles(data.files || []);

    return {
      identifier: sha,
      activityType: 'COMMIT',
      title,
      messageOrBody: commitMessage,
      url: htmlUrl,
      files,
      stats,
      limitations,
    };
  },

  fetchPullRequestChanges: async (owner: string, repo: string, prNumber: number): Promise<ActivityCodeDiff> => {
    const prResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(prNumber)}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Orkestr-App',
        },
      }
    );

    if (prResponse.status === 404) {
      throw new AppError(`Pull Request #${prNumber} was not found in ${owner}/${repo}`, 404);
    }
    if (prResponse.status === 403) {
      throw new AppError(`GitHub API rate limit exceeded or access forbidden for ${owner}/${repo}`, 403);
    }
    if (!prResponse.ok) {
      throw new AppError(`Failed to fetch PR from GitHub: HTTP ${prResponse.status}`, 502);
    }

    const prData: any = await prResponse.json();

    const filesResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(prNumber)}/files?per_page=100`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Orkestr-App',
        },
      }
    );

    if (!filesResponse.ok) {
      throw new AppError(`Failed to fetch PR files from GitHub: HTTP ${filesResponse.status}`, 502);
    }

    const rawFiles: any[] = (await filesResponse.json()) as any[];
    const title = prData.title || `PR #${prNumber}`;
    const body = prData.body || '';
    const htmlUrl = prData.html_url || `https://github.com/${owner}/${repo}/pull/${prNumber}`;

    const { files, stats, limitations } = sanitizeAndTruncateFiles(rawFiles);

    return {
      identifier: String(prNumber),
      activityType: 'PULL_REQUEST',
      title,
      messageOrBody: body,
      url: htmlUrl,
      files,
      stats,
      limitations,
    };
  },
};

const LOCKFILE_PATTERNS = [
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.yaml$/i,
  /composer\.lock$/i,
  /Cargo\.lock$/i,
  /Gemfile\.lock$/i,
  /poetry\.lock$/i,
];

const MAX_DIFF_CHARS_PER_FILE = 8000;
const MAX_INSPECTED_FILES = 30;

function sanitizeAndTruncateFiles(rawFiles: any[]): {
  files: ChangedFile[];
  stats: { totalFiles: number; additions: number; deletions: number; totalChanges: number };
  limitations: string[];
} {
  const limitations: string[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalChanges = 0;

  const totalFiles = (rawFiles || []).length;
  if (totalFiles > MAX_INSPECTED_FILES) {
    limitations.push(
      `Payload contained ${totalFiles} changed files. Only the first ${MAX_INSPECTED_FILES} files were inspected for diff analysis; remaining ${totalFiles - MAX_INSPECTED_FILES} files were listed with diffs omitted.`
    );
  }

  const files: ChangedFile[] = (rawFiles || []).map((file: any, index: number) => {
    const filename = file.filename || file.name || 'unknown';
    const status = (file.status || 'modified') as ChangedFile['status'];
    const additions = Number(file.additions || 0);
    const deletions = Number(file.deletions || 0);
    const changes = Number(file.changes || additions + deletions);

    totalAdditions += additions;
    totalDeletions += deletions;
    totalChanges += changes;

    const isLockfile = LOCKFILE_PATTERNS.some((pat) => pat.test(filename));
    const previousFilename = file.previous_filename || undefined;

    let patch: string | undefined = file.patch;
    let isTruncated = false;
    let isBinary = false;

    if (index >= MAX_INSPECTED_FILES) {
      patch = '[Diff omitted due to total file count limit]';
    } else if (isLockfile) {
      patch = '[Dependency lockfile content omitted from diff analysis to preserve model context]';
      limitations.push(`Dependency lockfile '${filename}' diff omitted from AI context.`);
    } else if (status === 'removed' && !patch) {
      patch = '[File was deleted]';
    } else if (!patch) {
      isBinary = true;
      patch = '[Binary file changed or diff unavailable from GitHub]';
      limitations.push(`Binary file or missing patch for '${filename}' (diff unavailable).`);
    } else if (patch.length > MAX_DIFF_CHARS_PER_FILE) {
      isTruncated = true;
      patch = patch.slice(0, MAX_DIFF_CHARS_PER_FILE) + '\n... [Diff truncated at 8,000 characters to prevent context overflow]';
      limitations.push(`Diff for '${filename}' was truncated at 8,000 characters.`);
    }

    return {
      filename,
      status,
      additions,
      deletions,
      changes,
      patch,
      isTruncated,
      isBinary,
      previousFilename,
    };
  });

  return {
    files,
    stats: {
      totalFiles,
      additions: totalAdditions,
      deletions: totalDeletions,
      totalChanges,
    },
    limitations,
  };
}

export const fetchActivityCodeChanges = async (
  repoOwner: string,
  repoName: string,
  activityType: 'COMMIT' | 'PULL_REQUEST',
  identifier: string
): Promise<ActivityCodeDiff> => {
  if (activityType === 'COMMIT') {
    return currentTransport.fetchCommitChanges(repoOwner, repoName, identifier);
  } else if (activityType === 'PULL_REQUEST') {
    const numericMatch = identifier.match(/\d+/);
    if (!numericMatch) {
      throw new AppError(`Invalid pull request identifier: ${identifier}`, 400);
    }
    return currentTransport.fetchPullRequestChanges(repoOwner, repoName, parseInt(numericMatch[0], 10));
  } else {
    throw new AppError(`Unsupported activity type for code change retrieval: ${activityType}`, 400);
  }
};

let currentTransport: GitHubApiTransport = defaultTransport;

/**
 * Used by automated tests to inject mock GitHub OAuth and API responses.
 */
export const setGitHubApiTransport = (mockTransport: Partial<GitHubApiTransport> | null): void => {
  if (!mockTransport) {
    currentTransport = defaultTransport;
  } else {
    currentTransport = {
      ...defaultTransport,
      ...mockTransport,
    };
  }
};

export const isGitHubConfigured = (): boolean => {
  return Boolean(config.github.clientId && config.github.clientSecret);
};

/**
 * Generate a cryptographically secure OAuth state and persist it with an expiry time.
 */
export const createOAuthState = async (
  userId: string,
  returnTo?: string,
  allowTransfer = false
): Promise<{ state: string; authUrl: string }> => {
  if (!isGitHubConfigured()) {
    throw new AppError(
      'GitHub integration is not configured on this server. GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET are required.',
      503
    );
  }

  const state = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  // Clean up any old expired states first
  await query(`DELETE FROM github_oauth_states WHERE expires_at < NOW()`).catch(() => {});

  const storedReturnTo = allowTransfer
    ? `__transfer__:${returnTo || '/settings?github=success'}`
    : returnTo || null;

  await query(
    `INSERT INTO github_oauth_states (state, user_id, return_to, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [state, userId, storedReturnTo, expiresAt]
  );

  const redirectUri = config.github.oauthCallbackUrl;
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
    config.github.clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
    'read:user,user:email'
  )}&state=${encodeURIComponent(state)}`;

  return { state, authUrl };
};

/**
 * Validates and consumes an OAuth state to prevent replay and CSRF attacks.
 */
export const validateAndConsumeOAuthState = async (
  state: string
): Promise<{ userId: string; returnTo: string | null; isTransfer: boolean }> => {
  if (!state || typeof state !== 'string') {
    throw new AppError('Missing or invalid OAuth state parameter', 400);
  }

  const res = await query<{ user_id: string; return_to: string | null; expires_at: Date }>(
    `SELECT user_id, return_to, expires_at
     FROM github_oauth_states
     WHERE state = $1`,
    [state]
  );

  if (res.rows.length === 0) {
    throw new AppError('Invalid OAuth state parameter or session expired', 400);
  }

  const record = res.rows[0];

  // Atomic single-use consumption: delete state immediately
  await query(`DELETE FROM github_oauth_states WHERE state = $1`, [state]);

  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new AppError('OAuth state parameter has expired. Please restart linking.', 400);
  }

  const rawReturnTo = record.return_to;
  const isTransfer = rawReturnTo?.startsWith('__transfer__:') ?? false;
  const returnTo = isTransfer && rawReturnTo ? rawReturnTo.replace('__transfer__:', '') : rawReturnTo;

  return { userId: record.user_id, returnTo, isTransfer };
};

/**
 * Handles completing the OAuth code exchange and linking the user profile.
 */
export const completeGitHubOAuth = async (
  code: string,
  state: string
): Promise<{ user: PublicUser; returnTo: string | null }> => {
  if (!code) {
    throw new AppError('Missing authorization code from GitHub', 400);
  }

  // 1. Validate & consume state
  const { userId, returnTo, isTransfer } = await validateAndConsumeOAuthState(state);

  // 2. Exchange authorization code for access token
  const accessToken = await currentTransport.exchangeCode(code, config.github.oauthCallbackUrl);

  // 3. Fetch user profile from GitHub API
  const profile = await currentTransport.fetchProfile(accessToken);

  // 4. Link GitHub identity to user account (with optional transfer)
  const updatedUser = await linkGitHubIdentity(userId, profile.id, profile.login, isTransfer);

  return { user: updatedUser, returnTo };
};

/**
 * Associates a GitHub numeric user ID and username with an Orkestr user.
 * Rejects duplicate linkage across different users unless transfer is confirmed.
 */
export const linkGitHubIdentity = async (
  userId: string,
  githubUserId: number,
  githubUsername: string,
  allowTransfer = false
): Promise<PublicUser> => {
  // Check if another Orkestr user is already linked to this GitHub user ID
  const existingRes = await query<{ id: string; email: string; username: string }>(
    `SELECT id, email, username FROM users WHERE github_user_id = $1`,
    [githubUserId]
  );

  if (existingRes.rows.length > 0 && existingRes.rows[0].id !== userId) {
    if (allowTransfer) {
      await query(
        `UPDATE users
         SET github_user_id = NULL,
             github_username = NULL,
             github_linked_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [existingRes.rows[0].id]
      );
    } else {
      throw new AppError(
        `This GitHub account is already linked to another Orkestr user (@${existingRes.rows[0].username || 'user'}).`,
        409
      );
    }
  }

  const updateRes = await query<UserRecord>(
    `UPDATE users
     SET github_user_id = $1,
         github_username = $2,
         github_linked_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, username, email, password_hash, skills, weekly_capacity_hours, is_available,
               github_user_id, github_username, github_linked_at, created_at, updated_at`,
    [githubUserId, githubUsername, userId]
  );

  if (updateRes.rows.length === 0) {
    throw new AppError('Target user not found', 404);
  }

  return sanitizeUser(updateRes.rows[0]);
};

/**
 * Safely unlinks a GitHub account from an authenticated Orkestr user.
 */
export const unlinkGitHubIdentity = async (userId: string): Promise<PublicUser> => {
  const updateRes = await query<UserRecord>(
    `UPDATE users
     SET github_user_id = NULL,
         github_username = NULL,
         github_linked_at = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, username, email, password_hash, skills, weekly_capacity_hours, is_available,
               github_user_id, github_username, github_linked_at, created_at, updated_at`,
    [userId]
  );

  if (updateRes.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  return sanitizeUser(updateRes.rows[0]);
};

/**
 * Retrieves the GitHub identity linking status for a user.
 */
export const getGitHubIdentityStatus = async (userId: string): Promise<GitHubIdentityStatus> => {
  const res = await query<{
    github_user_id: string | null;
    github_username: string | null;
    github_linked_at: string | null;
  }>(
    `SELECT github_user_id, github_username, github_linked_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (res.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const row = res.rows[0];
  const isLinked = Boolean(row.github_user_id);

  return {
    isConfigured: isGitHubConfigured(),
    isLinked,
    githubUserId: row.github_user_id ? String(row.github_user_id) : null,
    githubUsername: row.github_username || null,
    linkedAt: row.github_linked_at || null,
  };
};

/**
 * Retrieves the connected GitHub repository for a project.
 */
export const getProjectGitHubStatus = async (projectId: string): Promise<ProjectGitHubStatus> => {
  const res = await query<{
    github_repo_id: string | null;
    github_repo_owner: string | null;
    github_repo_name: string | null;
    github_installation_id: string | null;
    github_default_branch: string | null;
    github_connection_status: string | null;
    github_connected_at: string | null;
  }>(
    `SELECT github_repo_id, github_repo_owner, github_repo_name, github_installation_id,
            github_default_branch, github_connection_status, github_connected_at
     FROM projects
     WHERE id = $1`,
    [projectId]
  );

  if (res.rows.length === 0) {
    throw new AppError('Project not found', 404);
  }

  const row = res.rows[0];
  const isConnected =
    Boolean(row.github_repo_owner && row.github_repo_name) &&
    row.github_connection_status === 'CONNECTED';

  return {
    isConfigured: isGitHubConfigured(),
    isConnected,
    repoId: row.github_repo_id ? String(row.github_repo_id) : null,
    repoOwner: row.github_repo_owner || null,
    repoName: row.github_repo_name || null,
    fullName:
      row.github_repo_owner && row.github_repo_name
        ? `${row.github_repo_owner}/${row.github_repo_name}`
        : null,
    defaultBranch: row.github_default_branch || 'main',
    installationId: row.github_installation_id ? String(row.github_installation_id) : null,
    connectionStatus: row.github_connection_status || 'DISCONNECTED',
    connectedAt: row.github_connected_at || null,
  };
};

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

/**
 * Connects a GitHub repository to a project.
 * Verifies repository access via GitHub API and rejects unverified or duplicate links.
 */
export const connectProjectRepository = async (
  projectId: string,
  input: ConnectRepositoryInput
): Promise<ProjectGitHubStatus> => {
  if (!isGitHubConfigured()) {
    throw new AppError(
      'GitHub integration is not configured on this server. GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET are required to connect and verify repositories.',
      503
    );
  }

  const { repoOwner, repoName } = parseGitHubRepoCoordinates(
    input.repoOwner || '',
    input.repoName || ''
  );
  const installationId = normalizeInstallationId(input.installationId);

  if (!repoOwner || !repoName) {
    throw new AppError('Repository owner and name are required', 400);
  }

  if (installationId && !/^[0-9]+$/.test(installationId)) {
    throw new AppError('Installation ID must be a valid numeric identifier', 400);
  }

  const validNameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!validNameRegex.test(repoOwner)) {
    throw new AppError('Invalid repository owner format', 400);
  }
  if (!validNameRegex.test(repoName)) {
    throw new AppError('Invalid repository name format', 400);
  }

  // Verify repository exists, belongs to installation, and retrieve authentic metadata from GitHub API
  const verifiedRepo = await currentTransport.verifyRepositoryAccess(
    installationId,
    repoOwner,
    repoName
  );

  // Check for duplicate repository connections across projects
  const existingRes = await query<{ id: string; name: string }>(
    `SELECT id, name FROM projects
     WHERE github_repo_id = $1 AND github_connection_status = 'CONNECTED' AND id != $2`,
    [verifiedRepo.repoId, projectId]
  );

  if (existingRes.rows.length > 0) {
    throw new AppError(
      `This GitHub repository is already connected to project "${existingRes.rows[0].name}". A repository cannot be connected to multiple projects.`,
      409
    );
  }

  // Persist verified connection details to project
  const updateRes = await query(
    `UPDATE projects
     SET github_repo_id = $1,
         github_repo_owner = $2,
         github_repo_name = $3,
         github_installation_id = $4,
         github_default_branch = $5,
         github_connection_status = 'CONNECTED',
         github_connected_at = NOW(),
         updated_at = NOW()
     WHERE id = $6
     RETURNING id`,
    [
      verifiedRepo.repoId,
      verifiedRepo.repoOwner,
      verifiedRepo.repoName,
      installationId,
      verifiedRepo.defaultBranch,
      projectId,
    ]
  );

  if (updateRes.rows.length === 0) {
    throw new AppError('Project not found', 404);
  }

  return getProjectGitHubStatus(projectId);
};

/**
 * Disconnects the GitHub repository from a project.
 */
export const disconnectProjectRepository = async (
  projectId: string
): Promise<ProjectGitHubStatus> => {
  const updateRes = await query(
    `UPDATE projects
     SET github_repo_id = NULL,
         github_repo_owner = NULL,
         github_repo_name = NULL,
         github_installation_id = NULL,
         github_connection_status = 'DISCONNECTED',
         github_connected_at = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [projectId]
  );

  if (updateRes.rows.length === 0) {
    throw new AppError('Project not found', 404);
  }

  return getProjectGitHubStatus(projectId);
};
