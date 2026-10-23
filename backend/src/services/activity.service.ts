import { query, pool } from '../db';
import { AppError } from '../middleware/errorHandler';

export interface TaskGitHubActivityRecord {
  id: string;
  taskId: string;
  projectId: string;
  webhookEventId: string | null;
  activityType: 'COMMIT' | 'PULL_REQUEST';
  githubIdentifier: string;
  githubUrl: string;
  title: string;
  body: string | null;
  branch: string | null;
  authorGithubUsername: string | null;
  authorGithubId: number | null;
  authorUserId: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
  githubCreatedAt: string;
  createdAt: string;
}

export interface ActivityProcessingResult {
  eventId: string;
  eventType: string;
  projectId: string | null;
  status: 'PROCESSED' | 'UNASSOCIATED' | 'IGNORED' | 'FAILED';
  associationsCount: number;
  associatedTaskIds: string[];
  message: string;
}

/**
 * Parses all ORK-<task-reference> tokens from a text string.
 * Supports:
 * - Human-readable task number: ORK-42, ORK-1
 * - Full UUID: ORK-b7f3a8b2-13df-4f0e-a612-42da516ec223
 * - 8-character short hex UUID: ORK-b7f3a8b2
 */
export function extractTaskReferences(text: string | null | undefined): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Regex matches ORK-<number>, ORK-<uuid>, ORK-<short-hex-8>
  const regex = /\bORK-([0-9]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{8})\b/gi;
  const matches = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      matches.add(match[1]);
    }
  }

  return Array.from(matches);
}

/**
 * Resolves a task reference (numeric task_number or UUID) strictly within the given project.
 * Enforces project isolation: never returns a task from another project.
 */
export async function findTaskByReference(
  ref: string,
  projectId: string
): Promise<{ id: string; project_id: string; task_number: number; title: string } | null> {
  if (!ref || !projectId) {
    return null;
  }

  const isNumeric = /^[0-9]+$/.test(ref);
  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const isShortHex = /^[0-9a-f]{8}$/i.test(ref);

  if (isNumeric) {
    const taskNum = parseInt(ref, 10);
    const res = await query<{ id: string; project_id: string; task_number: number; title: string }>(
      `SELECT id, project_id, task_number, title
       FROM tasks
       WHERE task_number = $1 AND project_id = $2`,
      [taskNum, projectId]
    );
    return res.rows[0] || null;
  }

  if (isFullUuid) {
    const res = await query<{ id: string; project_id: string; task_number: number; title: string }>(
      `SELECT id, project_id, task_number, title
       FROM tasks
       WHERE id = $1 AND project_id = $2`,
      [ref, projectId]
    );
    return res.rows[0] || null;
  }

  if (isShortHex) {
    const res = await query<{ id: string; project_id: string; task_number: number; title: string }>(
      `SELECT id, project_id, task_number, title
       FROM tasks
       WHERE id::text LIKE $1 || '%' AND project_id = $2`,
      [ref.toLowerCase(), projectId]
    );
    return res.rows[0] || null;
  }

  return null;
}

/**
 * Resolves an Orkestr user ID strictly through the user's verified GitHub numeric user ID.
 * Adheres strictly to security requirements: NEVER guesses identity from email or author name.
 */
export async function resolveAuthorUserId(
  authorGithubId: number | null | undefined
): Promise<string | null> {
  if (authorGithubId == null || isNaN(Number(authorGithubId))) {
    return null;
  }

  const res = await query<{ id: string }>(
    `SELECT id FROM users WHERE github_user_id = $1`,
    [authorGithubId]
  );

  return res.rows[0]?.id || null;
}

/**
 * Idempotently processes a webhook event by ID, creating task-to-GitHub activity associations.
 * Updates the event status to PROCESSED (if associated), UNASSOCIATED (if no tasks referenced),
 * or FAILED (with rollback on error).
 */
export async function processWebhookEvent(eventId: string): Promise<ActivityProcessingResult> {
  // Fetch event record
  const eventRes = await query<{
    id: string;
    event_id: string;
    event_type: string;
    project_id: string | null;
    payload: any;
    status: string;
    retry_count: number;
  }>(
    `SELECT id, event_id, event_type, project_id, payload, status, retry_count
     FROM github_webhook_events
     WHERE id = $1`,
    [eventId]
  );

  if (eventRes.rows.length === 0) {
    throw new AppError(`Webhook event ${eventId} not found`, 404);
  }

  const event = eventRes.rows[0];
  const { event_type: eventType, project_id: projectId, payload } = event;

  // If no project associated or event already ignored
  if (!projectId) {
    return {
      eventId: event.id,
      eventType,
      projectId: null,
      status: 'IGNORED',
      associationsCount: 0,
      associatedTaskIds: [],
      message: 'Event is not associated with an active Orkestr project',
    };
  }

  if (eventType !== 'push' && eventType !== 'pull_request') {
    return {
      eventId: event.id,
      eventType,
      projectId,
      status: 'IGNORED',
      associationsCount: 0,
      associatedTaskIds: [],
      message: `Event type "${eventType}" is not supported for task activity association`,
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const associatedTaskIds = new Set<string>();
    let associationsCount = 0;

    if (eventType === 'push') {
      const refString = typeof payload.ref === 'string' ? payload.ref : '';
      const branchName = refString.replace(/^refs\/heads\//, '');
      const branchRefs = extractTaskReferences(branchName);

      // Pre-resolve branch-level task matches
      const branchTasks: string[] = [];
      for (const bRef of branchRefs) {
        const matched = await findTaskByReference(bRef, projectId);
        if (matched) {
          branchTasks.push(matched.id);
        }
      }

      // Collect commits: either array or head_commit fallback
      let commits: any[] = [];
      if (Array.isArray(payload.commits) && payload.commits.length > 0) {
        commits = payload.commits;
      } else if (payload.head_commit && typeof payload.head_commit === 'object') {
        commits = [payload.head_commit];
      }

      const senderGithubId = payload.sender?.id ? Number(payload.sender.id) : null;
      const senderGithubUsername = payload.sender?.login || null;

      for (const commit of commits) {
        const commitSha = commit.id || commit.sha;
        if (!commitSha || typeof commitSha !== 'string') continue;

        const commitMessage = typeof commit.message === 'string' ? commit.message : '';
        const commitRefs = extractTaskReferences(commitMessage);

        const targetTaskIds = new Set<string>([...branchTasks]);
        for (const cRef of commitRefs) {
          const matched = await findTaskByReference(cRef, projectId);
          if (matched) {
            targetTaskIds.add(matched.id);
          }
        }

        if (targetTaskIds.size === 0) continue;

        const firstLineTitle = commitMessage.split('\n')[0].trim() || `Commit ${commitSha.substring(0, 7)}`;
        const commitUrl =
          commit.url ||
          (payload.repository?.html_url ? `${payload.repository.html_url}/commit/${commitSha}` : '');
        const commitTimestamp = commit.timestamp
          ? new Date(commit.timestamp).toISOString()
          : new Date().toISOString();

        // Reliable numeric identity from sender or commit author
        const authorGithubUsername = commit.author?.username || senderGithubUsername;
        const authorGithubId = senderGithubId;
        const authorUserId = await resolveAuthorUserId(authorGithubId);

        for (const taskId of targetTaskIds) {
          const insertRes = await client.query(
            `INSERT INTO task_github_activities (
               task_id,
               project_id,
               webhook_event_id,
               activity_type,
               github_identifier,
               github_url,
               title,
               body,
               branch,
               author_github_username,
               author_github_id,
               author_user_id,
               github_created_at,
               created_at
             )
             VALUES ($1, $2, $3, 'COMMIT', $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
             ON CONFLICT (task_id, activity_type, github_identifier) DO NOTHING
             RETURNING id`,
            [
              taskId,
              projectId,
              event.id,
              commitSha,
              commitUrl,
              firstLineTitle,
              commitMessage,
              branchName,
              authorGithubUsername,
              authorGithubId,
              authorUserId,
              commitTimestamp,
            ]
          );

          if (insertRes.rows.length > 0) {
            associationsCount++;
          }
          associatedTaskIds.add(taskId);
        }
      }
    } else if (eventType === 'pull_request') {
      const pr = payload.pull_request;
      if (pr) {
        const prNumber = pr.number != null ? String(pr.number) : '';
        const prTitle = typeof pr.title === 'string' ? pr.title : '';
        const prBody = typeof pr.body === 'string' ? pr.body : '';
        const headBranch = pr.head?.ref || '';

        const references = new Set<string>([
          ...extractTaskReferences(headBranch),
          ...extractTaskReferences(prTitle),
          ...extractTaskReferences(prBody),
        ]);

        const targetTaskIds = new Set<string>();
        for (const ref of references) {
          const matched = await findTaskByReference(ref, projectId);
          if (matched) {
            targetTaskIds.add(matched.id);
          }
        }

        if (targetTaskIds.size > 0 && prNumber) {
          const prUrl =
            pr.html_url ||
            (payload.repository?.html_url ? `${payload.repository.html_url}/pull/${prNumber}` : '');
          const prCreatedAt = pr.created_at || pr.updated_at || new Date().toISOString();
          const prAuthorUsername = pr.user?.login || payload.sender?.login || null;
          const prAuthorId = pr.user?.id ? Number(pr.user.id) : (payload.sender?.id ? Number(payload.sender.id) : null);
          const authorUserId = await resolveAuthorUserId(prAuthorId);

          for (const taskId of targetTaskIds) {
            const insertRes = await client.query(
              `INSERT INTO task_github_activities (
                 task_id,
                 project_id,
                 webhook_event_id,
                 activity_type,
                 github_identifier,
                 github_url,
                 title,
                 body,
                 branch,
                 author_github_username,
                 author_github_id,
                 author_user_id,
                 github_created_at,
                 created_at
               )
               VALUES ($1, $2, $3, 'PULL_REQUEST', $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
               ON CONFLICT (task_id, activity_type, github_identifier) DO NOTHING
               RETURNING id`,
              [
                taskId,
                projectId,
                event.id,
                prNumber,
                prUrl,
                prTitle || `Pull Request #${prNumber}`,
                prBody,
                headBranch,
                prAuthorUsername,
                prAuthorId,
                authorUserId,
                prCreatedAt,
              ]
            );

            if (insertRes.rows.length > 0) {
              associationsCount++;
            }
            associatedTaskIds.add(taskId);
          }
        }
      }
    }

    // Determine final status
    const finalStatus = associatedTaskIds.size > 0 ? 'PROCESSED' : 'UNASSOCIATED';
    const finalErrorMessage =
      associatedTaskIds.size > 0 ? null : 'No valid task references found in activity payload';

    await client.query(
      `UPDATE github_webhook_events
       SET status = $1,
           error_message = $2,
           processed_at = NOW()
       WHERE id = $3`,
      [finalStatus, finalErrorMessage, event.id]
    );

    await client.query('COMMIT');

    return {
      eventId: event.id,
      eventType,
      projectId,
      status: finalStatus,
      associationsCount,
      associatedTaskIds: Array.from(associatedTaskIds),
      message:
        finalStatus === 'PROCESSED'
          ? `Successfully processed event and created ${associationsCount} task activity association(s)`
          : 'Event parsed successfully but contained no task references for this project',
    };
  } catch (error: any) {
    await client.query('ROLLBACK');

    // Record failure on event model without losing raw event data
    await query(
      `UPDATE github_webhook_events
       SET status = 'FAILED',
           error_message = $1,
           retry_count = retry_count + 1
       WHERE id = $2`,
      [error.message || 'Unknown processing error', event.id]
    );

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Processes all unhandled PENDING webhook events.
 */
export async function processPendingWebhookEvents(): Promise<ActivityProcessingResult[]> {
  const pendingRes = await query<{ id: string }>(
    `SELECT id
     FROM github_webhook_events
     WHERE status = 'PENDING'
     ORDER BY created_at ASC`
  );

  const results: ActivityProcessingResult[] = [];
  for (const row of pendingRes.rows) {
    try {
      const res = await processWebhookEvent(row.id);
      results.push(res);
    } catch (err: any) {
      console.error(`Failed to process webhook event ${row.id}:`, err);
    }
  }

  return results;
}

/**
 * Retrieves all GitHub activities linked to a specific task within its project.
 */
export async function getActivitiesForTask(
  taskId: string,
  projectId: string
): Promise<TaskGitHubActivityRecord[]> {
  const res = await query<{
    id: string;
    task_id: string;
    project_id: string;
    webhook_event_id: string | null;
    activity_type: 'COMMIT' | 'PULL_REQUEST';
    github_identifier: string;
    github_url: string;
    title: string;
    body: string | null;
    branch: string | null;
    author_github_username: string | null;
    author_github_id: string | null;
    author_user_id: string | null;
    author_name: string | null;
    author_email: string | null;
    github_created_at: string;
    created_at: string;
  }>(
    `SELECT 
       a.id,
       a.task_id,
       a.project_id,
       a.webhook_event_id,
       a.activity_type,
       a.github_identifier,
       a.github_url,
       a.title,
       a.body,
       a.branch,
       a.author_github_username,
       a.author_github_id,
       a.author_user_id,
       u.name AS author_name,
       u.email AS author_email,
       a.github_created_at,
       a.created_at
     FROM task_github_activities a
     LEFT JOIN users u ON a.author_user_id = u.id
     WHERE a.task_id = $1 AND a.project_id = $2
     ORDER BY a.github_created_at DESC`,
    [taskId, projectId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    webhookEventId: row.webhook_event_id,
    activityType: row.activity_type,
    githubIdentifier: row.github_identifier,
    githubUrl: row.github_url,
    title: row.title,
    body: row.body,
    branch: row.branch,
    authorGithubUsername: row.author_github_username,
    authorGithubId: row.author_github_id != null ? Number(row.author_github_id) : null,
    authorUserId: row.author_user_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    githubCreatedAt: row.github_created_at,
    createdAt: row.created_at,
  }));
}
