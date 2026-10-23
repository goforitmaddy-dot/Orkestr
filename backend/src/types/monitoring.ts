/**
 * Monitoring and Incident Domain Types
 * Defines the core models separating WebhookEvent, WorkflowRun, FailureOccurrence, and Incident
 */

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RECOVERED' | 'RESOLVED' | 'CLOSED';

export type WebhookStatus = 'PENDING' | 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'FAILED';

export interface AssociatedPullRequest {
  number: number;
  title: string | null;
  url: string | null;
}

export interface WebhookEventRecord {
  id: string;
  provider: string;
  delivery_id: string;
  event_type: string;
  action: string | null;
  payload: Record<string, unknown>;
  status: WebhookStatus;
  error_message: string | null;
  received_at: string;
}

export interface WorkflowRunRecord {
  id: string;
  provider: string;
  provider_run_id: string;
  run_attempt: number;
  repository_name: string;
  workflow_name: string;
  branch: string | null;
  commit_sha: string | null;
  html_url: string | null;
  commit_url: string | null;
  pr_number: number | null;
  pr_title: string | null;
  pr_url: string | null;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentRecord {
  id: string;
  incident_key: string;
  title: string;
  repository_name: string;
  workflow_name: string;
  branch: string | null;
  status: IncidentStatus;
  first_failure_at: string;
  last_failure_at: string;
  recovered_at: string | null;
  latest_workflow_run_id: string | null;
  recovery_workflow_run_id: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface FailureOccurrenceRecord {
  id: string;
  incident_id: string;
  workflow_run_id: string;
  webhook_event_id: string | null;
  failed_job: string | null;
  failed_step: string | null;
  failure_timestamp: string;
  error_message: string | null;
  log_excerpt: string | null;
  run_url: string | null;
  commit_url: string | null;
  raw_details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Normalized Monitoring Record (Stage 3)
 * Represents parsed, normalized data from CI webhook events with explicit unavailability.
 */
export interface NormalizedMonitoringRecord {
  provider: string;
  deliveryId: string;
  eventType: string;
  action: string | null;

  // Identity & context
  repositoryName: string;
  workflowName: string;
  workflowRunId: string;
  runAttempt: number;
  branch: string | null;
  commitSha: string | null;

  // PR details (explicit null when unavailable)
  associatedPullRequest: AssociatedPullRequest | null;

  // Job & Step details (explicit null when unavailable)
  failedJob: string | null;
  failedStep: string | null;

  // Timing
  failureTimestamp: string;

  // Error & Log details (bounded excerpt, never entire log)
  errorMessage: string | null;
  logExcerpt: string | null;

  // Stable Links
  runUrl: string | null;
  commitUrl: string | null;

  // Status & Classification
  status: string;
  conclusion: string | null;
  isFailure: boolean;
  isRecovery: boolean;

  // Context metadata
  rawDetails: Record<string, unknown>;
}

export interface IngestionResult {
  isDuplicate: boolean;
  webhookEventId?: string;
  actionTaken:
    | 'CREATED_INCIDENT'
    | 'ATTACHED_TO_INCIDENT'
    | 'RECOVERED_INCIDENT'
    | 'RECORDED_RUN_ONLY'
    | 'SKIPPED_DUPLICATE'
    | 'IGNORED_EVENT';
  normalizedRecord?: NormalizedMonitoringRecord;
  incidentId?: string;
  occurrenceId?: string;
  workflowRunId?: string;
  message: string;
}
