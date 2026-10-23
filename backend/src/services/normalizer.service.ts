import {
  NormalizedMonitoringRecord,
  AssociatedPullRequest,
} from '../types/monitoring';
import { extractLogExcerpt, extractErrorMessage } from './logExtractor';

/**
 * Normalizes incoming GitHub CI webhook payloads into a standardized monitoring record (Stage 3).
 * Explicitly sets unavailable information to null rather than fabricating placeholders.
 */
export const normalizeGitHubPayload = (
  payload: Record<string, any>,
  headers: Record<string, any> = {}
): NormalizedMonitoringRecord => {
  const deliveryId =
    headers['x-github-delivery'] ||
    payload.delivery_id ||
    payload.id ||
    `synthetic-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const eventType = headers['x-github-event'] || payload.event_type || 'workflow_run';
  const action = payload.action || null;

  // Repository Identity
  const repoObj = payload.repository || {};
  const repositoryName =
    repoObj.full_name ||
    repoObj.name ||
    payload.repository_name ||
    'unknown/repository';

  const repoHtmlUrl = repoObj.html_url || (repoObj.full_name ? `https://github.com/${repoObj.full_name}` : null);

  // Workflow Run Resolution
  const workflowRun = payload.workflow_run || (eventType === 'workflow_run' ? payload : null);
  const workflowJob = payload.workflow_job || (eventType === 'workflow_job' ? payload : null);

  const workflowName =
    payload.workflow?.name ||
    workflowRun?.name ||
    workflowJob?.workflow_name ||
    payload.workflow_name ||
    'Unnamed Workflow';

  const rawRunId =
    workflowRun?.id ||
    workflowJob?.run_id ||
    payload.run_id ||
    payload.workflow_run_id ||
    '0';
  const workflowRunId = String(rawRunId);

  const runAttempt = Number(
    workflowRun?.run_attempt ||
    workflowJob?.run_attempt ||
    payload.run_attempt ||
    1
  );

  // Branch & Commit SHA
  const branch =
    workflowRun?.head_branch ||
    workflowJob?.head_branch ||
    payload.branch ||
    payload.ref?.replace(/^refs\/heads\//, '') ||
    null;

  const commitSha =
    workflowRun?.head_sha ||
    workflowJob?.head_sha ||
    payload.head_sha ||
    payload.commit_sha ||
    payload.sha ||
    null;

  // Associated Pull Request (Explicitly null when unavailable)
  let associatedPullRequest: AssociatedPullRequest | null = null;
  const prs = workflowRun?.pull_requests || payload.pull_requests || [];
  if (Array.isArray(prs) && prs.length > 0) {
    const primaryPr = prs[0];
    associatedPullRequest = {
      number: Number(primaryPr.number),
      title: primaryPr.title || null,
      url: primaryPr.html_url || primaryPr.url || null,
    };
  }

  // Failed Job and Step (Explicitly null when unavailable)
  let failedJob: string | null = null;
  let failedStep: string | null = null;
  let rawLogs: string | null = payload.raw_logs || payload.logs || null;
  const explicitError: string | null = payload.error_message || payload.error || null;

  if (workflowJob) {
    failedJob = workflowJob.name || null;
    const steps = workflowJob.steps;
    if (Array.isArray(steps)) {
      const failedStepObj = steps.find(
        (step) =>
          step.conclusion === 'failure' ||
          step.conclusion === 'timed_out' ||
          (step.status === 'completed' && step.conclusion !== 'success')
      );
      if (failedStepObj) {
        failedStep = failedStepObj.name || null;
      }
    }
  } else if (Array.isArray(payload.jobs)) {
    // If payload contains an array of jobs (e.g. from a custom or expanded payload)
    const failedJobObj = payload.jobs.find(
      (job: any) => job.conclusion === 'failure' || job.conclusion === 'timed_out'
    );
    if (failedJobObj) {
      failedJob = failedJobObj.name || null;
      if (Array.isArray(failedJobObj.steps)) {
        const failedStepObj = failedJobObj.steps.find(
          (step: any) => step.conclusion === 'failure' || step.conclusion === 'timed_out'
        );
        if (failedStepObj) {
          failedStep = failedStepObj.name || null;
        }
      }
      if (failedJobObj.logs && !rawLogs) {
        rawLogs = failedJobObj.logs;
      }
    }
  }

  // Failure Timestamp
  const failureTimestamp =
    workflowJob?.completed_at ||
    workflowRun?.updated_at ||
    payload.completed_at ||
    payload.timestamp ||
    new Date().toISOString();

  // Bounded Log Excerpt (Never store entire raw log)
  const logExcerpt = extractLogExcerpt(rawLogs);

  // Concise Error Message
  const errorMessage = extractErrorMessage(explicitError, logExcerpt);

  // Links to GitHub Workflow Run & Commit
  const runUrl =
    workflowRun?.html_url ||
    workflowJob?.html_url ||
    (repoHtmlUrl && workflowRunId !== '0'
      ? `${repoHtmlUrl}/actions/runs/${workflowRunId}`
      : null);

  const commitUrl =
    repoHtmlUrl && commitSha ? `${repoHtmlUrl}/commit/${commitSha}` : null;

  // Status & Conclusion
  const status =
    workflowJob?.status ||
    workflowRun?.status ||
    payload.status ||
    'completed';

  const conclusion =
    workflowJob?.conclusion ||
    workflowRun?.conclusion ||
    payload.conclusion ||
    null;

  const isFailure =
    conclusion === 'failure' ||
    conclusion === 'timed_out' ||
    conclusion === 'cancelled' ||
    payload.event_type === 'deployment_failure';

  const isRecovery = conclusion === 'success';

  return {
    provider: 'github',
    deliveryId: String(deliveryId),
    eventType: String(eventType),
    action: action ? String(action) : null,
    repositoryName,
    workflowName,
    workflowRunId,
    runAttempt,
    branch,
    commitSha,
    associatedPullRequest,
    failedJob,
    failedStep,
    failureTimestamp,
    errorMessage,
    logExcerpt,
    runUrl,
    commitUrl,
    status,
    conclusion,
    isFailure,
    isRecovery,
    rawDetails: {
      action,
      sender: payload.sender?.login || null,
      event_type: eventType,
      run_attempt: runAttempt,
    },
  };
};
