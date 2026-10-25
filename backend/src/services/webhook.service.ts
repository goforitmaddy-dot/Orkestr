import crypto from 'crypto';
import { query } from '../db';
import { AppError } from '../middleware/errorHandler';

export interface ExtractedWebhookMetadata {
  repoId: number | null;
  repoFullName: string | null;
  repoOwner: string | null;
  repoName: string | null;
  installationId: number | null;
  branch: string | null;
  commitShas: string[];
  headCommitSha: string | null;
  baseCommitSha: string | null;
  prNumber: number | null;
  prAction: string | null;
  prTitle: string | null;
}

export interface WebhookIngestResult {
  success: boolean;
  message: string;
  deliveryId: string;
  eventId?: string;
  projectId?: string | null;
  status: string;
  duplicate?: boolean;
  ignored?: boolean;
}

export interface ConnectedProjectMatch {
  id: string;
  name: string;
  githubRepoId: string;
  githubInstallationId: string | null;
  githubConnectionStatus: string;
}

/**
 * Validates a GitHub webhook delivery's X-Hub-Signature-256 header.
 * Uses timingSafeEqual against the exact raw request body buffer to prevent timing attacks.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret || typeof signatureHeader !== 'string') {
    return false;
  }

  const trimmed = signatureHeader.trim();
  const parts = trimmed.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const providedHex = parts[1].toLowerCase();
  // Valid SHA256 hex is exactly 64 characters
  if (!/^[0-9a-f]{64}$/.test(providedHex)) {
    return false;
  }

  const cleanedSecret = secret.trim().replace(/^["']|["']$/g, '');
  const hmac = crypto.createHmac('sha256', cleanedSecret);
  hmac.update(rawBody);
  const expectedHex = hmac.digest('hex').toLowerCase();

  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const providedBuf = Buffer.from(providedHex, 'utf8');

  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Extracts relevant repository, branch, commit, and PR identifiers from GitHub payloads.
 * Strictly adheres to security rules: never infers developer identity from author names or emails.
 */
export function extractWebhookMetadata(
  eventType: string,
  payload: any
): ExtractedWebhookMetadata {
  const repo = payload?.repository;
  const repoId = repo?.id != null ? Number(repo.id) : null;
  const repoFullName =
    repo?.full_name ||
    (repo?.owner?.login && repo?.name ? `${repo.owner.login}/${repo.name}` : null);
  let repoOwner: string | null =
    (typeof repo?.owner?.login === 'string' ? repo.owner.login : null) ||
    (typeof repo?.owner?.name === 'string' ? repo.owner.name : null);
  let repoName: string | null = typeof repo?.name === 'string' ? repo.name : null;

  if ((!repoOwner || !repoName) && repoFullName) {
    const parts = repoFullName.split('/');
    if (parts.length >= 2) {
      if (!repoOwner) repoOwner = parts[0];
      if (!repoName) repoName = parts[1];
    }
  }

  const installationId =
    payload?.installation?.id != null ? Number(payload.installation.id) : null;

  let branch: string | null = null;
  let commitShas: string[] = [];
  let headCommitSha: string | null = null;
  let baseCommitSha: string | null = null;
  let prNumber: number | null = null;
  let prAction: string | null = null;
  let prTitle: string | null = null;

  if (eventType === 'push') {
    if (typeof payload?.ref === 'string') {
      branch = payload.ref.replace(/^refs\/heads\//, '');
    }
    if (Array.isArray(payload?.commits)) {
      commitShas = payload.commits
        .map((c: any) => (typeof c?.id === 'string' ? c.id.trim() : ''))
        .filter((sha: string) => sha.length > 0);
    }
    headCommitSha =
      typeof payload?.after === 'string' &&
      payload.after !== '0000000000000000000000000000000000000000'
        ? payload.after
        : typeof payload?.head_commit?.id === 'string'
        ? payload.head_commit.id
        : null;
    baseCommitSha =
      typeof payload?.before === 'string' &&
      payload.before !== '0000000000000000000000000000000000000000'
        ? payload.before
        : null;
  } else if (eventType === 'pull_request') {
    const pr = payload?.pull_request;
    prAction = typeof payload?.action === 'string' ? payload.action : null;
    prNumber =
      pr?.number != null
        ? Number(pr.number)
        : payload?.number != null
        ? Number(payload.number)
        : null;
    prTitle = typeof pr?.title === 'string' ? pr.title : null;
    branch = typeof pr?.head?.ref === 'string' ? pr.head.ref : null;
    headCommitSha = typeof pr?.head?.sha === 'string' ? pr.head.sha : null;
    baseCommitSha = typeof pr?.base?.sha === 'string' ? pr.base.sha : null;
    if (headCommitSha) {
      commitShas = [headCommitSha];
    }
  }

  return {
    repoId,
    repoFullName,
    repoOwner,
    repoName,
    installationId,
    branch,
    commitShas,
    headCommitSha,
    baseCommitSha,
    prNumber,
    prAction,
    prTitle,
  };
}

/**
 * Finds an actively connected project matching the repository ID or owner/name,
 * and verifies installation ID where present.
 * Supports identifier backfilling when connection was stored with partial identifiers.
 */
export async function findConnectedProjectForRepository(
  repoId: number | null,
  payloadInstallationId: number | null,
  repoOwner?: string | null,
  repoName?: string | null
): Promise<ConnectedProjectMatch | null> {
  const res = await query<{
    id: string;
    name: string;
    github_repo_id: string | null;
    github_repo_owner: string | null;
    github_repo_name: string | null;
    github_installation_id: string | null;
    github_connection_status: string;
  }>(
    `SELECT id, name, github_repo_id, github_repo_owner, github_repo_name, github_installation_id, github_connection_status
     FROM projects
     WHERE (
       ($1::bigint IS NOT NULL AND github_repo_id = $1::bigint)
       OR
       ($2::text IS NOT NULL AND $3::text IS NOT NULL AND LOWER(github_repo_owner) = LOWER($2) AND LOWER(github_repo_name) = LOWER($3))
     )
     AND github_connection_status = 'CONNECTED'
     LIMIT 1`,
    [repoId, repoOwner || null, repoName || null]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const project = res.rows[0];

  // If project has an installation ID and payload also provides an installation ID, verify they match
  if (
    project.github_installation_id != null &&
    payloadInstallationId != null &&
    String(project.github_installation_id).trim() !== String(payloadInstallationId).trim()
  ) {
    throw new AppError(
      `Repository/installation mismatch: payload specifies installation ID ${payloadInstallationId} but connected project is linked to installation ID ${project.github_installation_id}`,
      400
    );
  }

  // Self-heal / backfill numeric repoId if it was missing from the project record
  if (repoId != null && project.github_repo_id == null) {
    await query(
      `UPDATE projects SET github_repo_id = $1, updated_at = NOW() WHERE id = $2 AND github_repo_id IS NULL`,
      [repoId, project.id]
    ).catch(() => {});
  }

  // Self-heal / backfill installationId if it was missing from the project record
  if (payloadInstallationId != null && project.github_installation_id == null) {
    await query(
      `UPDATE projects SET github_installation_id = $1, updated_at = NOW() WHERE id = $2 AND github_installation_id IS NULL`,
      [payloadInstallationId, project.id]
    ).catch(() => {});
  }

  return {
    id: project.id,
    name: project.name,
    githubRepoId: String(project.github_repo_id || repoId || ''),
    githubInstallationId:
      project.github_installation_id || (payloadInstallationId ? String(payloadInstallationId) : null),
    githubConnectionStatus: project.github_connection_status,
  };
}

/**
 * Handles incoming GitHub webhook delivery persistence, deduplication, and project association.
 * Keeps status as PENDING (does NOT mark processed).
 */
export async function ingestWebhookEvent(
  deliveryId: string,
  eventType: string,
  payload: any
): Promise<WebhookIngestResult> {
  if (!deliveryId || typeof deliveryId !== 'string') {
    throw new AppError('Invalid or missing X-GitHub-Delivery header', 400);
  }

  if (!eventType || typeof eventType !== 'string') {
    throw new AppError('Invalid or missing X-GitHub-Event header', 400);
  }

  // Handle GitHub ping event
  if (eventType === 'ping') {
    return {
      success: true,
      message: 'GitHub ping event received successfully',
      deliveryId,
      status: 'IGNORED',
      ignored: true,
    };
  }

  // Deduplicate delivery using atomic database check
  const existingRes = await query<{
    id: string;
    event_id: string;
    status: string;
    created_at: string;
  }>(
    `SELECT id, event_id, status, created_at
     FROM github_webhook_events
     WHERE event_id = $1`,
    [deliveryId]
  );

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    return {
      success: true,
      message: 'Webhook delivery already received and deduplicated',
      deliveryId,
      eventId: existing.id,
      status: existing.status,
      duplicate: true,
    };
  }

  // Handle unsupported event types (e.g. issues, star, fork)
  const isSupportedEvent = eventType === 'push' || eventType === 'pull_request';
  if (!isSupportedEvent) {
    return {
      success: true,
      message: `Event type "${eventType}" is not processed by Orkestr task verification and was ignored`,
      deliveryId,
      status: 'IGNORED',
      ignored: true,
    };
  }

  // Extract metadata and repository coordinates
  const meta = extractWebhookMetadata(eventType, payload);

  if (meta.repoId == null && (!meta.repoOwner || !meta.repoName)) {
    throw new AppError('Webhook payload is missing repository identifier', 400);
  }

  // Look up actively connected project
  const matchedProject = await findConnectedProjectForRepository(
    meta.repoId,
    meta.installationId,
    meta.repoOwner,
    meta.repoName
  );

  // If repository is unknown (not connected to any Orkestr project)
  if (!matchedProject) {
    const insertIgnored = await query<{ id: string; status: string }>(
      `INSERT INTO github_webhook_events (
         event_id,
         event_type,
         project_id,
         payload,
         status,
         github_installation_id,
         github_repo_id,
         error_message,
         created_at
       )
       VALUES ($1, $2, NULL, $3, 'IGNORED', $4, $5, $6, NOW())
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id, status`,
      [
        deliveryId,
        eventType,
        payload,
        meta.installationId,
        meta.repoId,
        `Repository ${meta.repoFullName || meta.repoId} is not connected to any active Orkestr project`,
      ]
    );

    const eventId = insertIgnored.rows[0]?.id;

    return {
      success: true,
      message: `Webhook delivery acknowledged: repository ${meta.repoFullName || meta.repoId} is not connected to an active Orkestr project`,
      deliveryId,
      eventId,
      projectId: null,
      status: 'IGNORED',
      ignored: true,
    };
  }

  // Persist delivery atomically with status = PENDING (never marked PROCESSED upon receipt)
  const insertRes = await query<{ id: string; status: string; created_at: string }>(
    `INSERT INTO github_webhook_events (
       event_id,
       event_type,
       project_id,
       payload,
       status,
       github_installation_id,
       github_repo_id,
       created_at
     )
     VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, NOW())
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id, status, created_at`,
    [
      deliveryId,
      eventType,
      matchedProject.id,
      payload,
      meta.installationId,
      meta.repoId,
    ]
  );

  // Atomic race check if concurrent delivery inserted before us
  if (insertRes.rows.length === 0) {
    return {
      success: true,
      message: 'Webhook delivery already received and deduplicated',
      deliveryId,
      status: 'PENDING',
      duplicate: true,
    };
  }

  const record = insertRes.rows[0];

  return {
    success: true,
    message: `GitHub ${eventType} event successfully ingested and queued for verification`,
    deliveryId,
    eventId: record.id,
    projectId: matchedProject.id,
    status: record.status,
  };
}
