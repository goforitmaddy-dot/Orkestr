export interface Project {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  repository: string | null;
  server_url: string | null;
  monitoring_enabled: boolean;
  last_polled_at: string | null;
  last_poll_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  provider?: string;
  repository?: string;
  monitoringEnabled?: boolean;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  provider?: string;
  repository?: string | null;
  monitoringEnabled?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export type ProjectMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  created_at: string;
}

export interface HealthStatus {
  status: string;
  uptime: number;
  timestamp: string;
  services: {
    api: string;
    database: 'connected' | 'disconnected';
    monitoring?: 'configured' | 'unconfigured';
    liveStream?: 'active' | 'idle';
  };
  github?: {
    userTokenConfigured: boolean;
    serverTokenConfigured: boolean;
    connectionStatus: 'valid' | 'invalid' | 'unverified' | 'none';
    accountLogin: string | null;
    lastValidatedAt: string | null;
    source: 'user' | 'server' | 'none';
  };
}

export interface ApiErrorResponse {
  error: {
    message: string;
    statusCode: number;
    details?: Array<{ path: string; message: string }>;
  };
}

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RECOVERED' | 'RESOLVED' | 'CLOSED';

export interface Incident {
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

export interface FailureOccurrence {
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

export interface WorkflowRun {
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
}

export interface IncidentDetails {
  incident: Incident;
  latestRun: WorkflowRun | null;
  recoveryRun: WorkflowRun | null;
  occurrences: FailureOccurrence[];
  occurrencesCount: number;
}

/* -------------------------------------------------------------------------- */
/* Live server monitoring                                                      */
/* -------------------------------------------------------------------------- */

export type ServerHealthStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export interface ServerMonitoringConfig {
  serverUrl: string | null;
  environment: string;
  webhookUrl: string | null;
  notifyTeam: boolean;
  healthCheckIntervalMs: number;
  enabled: boolean;
}

export interface ServerHealth {
  projectId: string;
  status: ServerHealthStatus;
  responseTimeMs: number | null;
  lastCheckedAt: string | null;
  uptimePercent: number | null;
  lastError: string | null;
}

export type ServerErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ServerErrorReport {
  id: string;
  projectId: string;
  message: string;
  stackTrace: string | null;
  severity: ServerErrorSeverity;
  environment: string | null;
  occurredAt: string;
  resolved: boolean;
  resolvedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Application runtime errors                                                  */
/* -------------------------------------------------------------------------- */

export type ApplicationErrorStatus = 'OPEN' | 'RESOLVED' | 'IGNORED';

export interface ApplicationError {
  id: string;
  project_id: string | null;
  repository_name: string | null;
  environment: string | null;
  service: string | null;
  error_type: string | null;
  message: string;
  stack_trace: string | null;
  fingerprint: string;
  occurrence_count: number;
  affected_users: number | null;
  release_version: string | null;
  source_url: string | null;
  status: ApplicationErrorStatus;
  context: Record<string, unknown> | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Monitoring status                                                           */
/* -------------------------------------------------------------------------- */

export interface MonitoringTarget {
  projectId: string;
  projectName: string;
  repository: string | null;
  monitoringEnabled: boolean;
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  workflowRunsInspected: number;
  failedRunsFound: number;
  failuresDetected: number;
  lastError: string | null;
}

export interface MonitoringUserConnection {
  provider: string;
  accountLogin: string | null;
  tokenHint: string;
  scopes: string[];
  status: 'unverified' | 'valid' | 'invalid';
  lastValidatedAt: string | null;
  lastError: string | null;
}

export interface MonitoringStatus {
  enabled: boolean;
  provider: string;
  credentialsConfigured: boolean;
  serverTokenConfigured: boolean;
  userConnections: {
    total: number;
    valid: number;
    invalid: number;
  };
  userConnection: MonitoringUserConnection | null;
  pollIntervalMs: number;
  monitoredProjectCount: number;
  linkedProjectCount: number;
  streamSubscribers: number;
  lastCycle: {
    last_run_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    runs_scanned: number | null;
    failed_runs: number | null;
    failures_detected: number | null;
  } | null;
  targets: MonitoringTarget[];
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
  workflowRunsInspected: number;
  failedRunsFound: number;
  failuresDetected: number;
  recoveriesDetected: number;
  errors: PollIssue[];
  githubApiErrors: PollIssue[];
  targets: PollTargetResult[];
  runsScanned: number;
  skipped: boolean;
  skipReason: string | null;
}

export interface MonitoringSummary {
  activeIncidents: number;
  recoveredIncidents: number;
  activeRuntimeErrors: number;
  resolvedRuntimeErrors: number;
  totalActiveErrors: number;
}

/** Events pushed by the backend over the Server-Sent Events stream. */
export type MonitoringEventType =
  | 'incident.created'
  | 'incident.updated'
  | 'incident.resolved'
  | 'error.created'
  | 'error.updated'
  | 'error.resolved'
  | 'monitoring.status';


/** A signed-in Orkestr account. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  last_login_at: string | null;
}

/** A GitHub personal access token connected to an account. */
export interface GitHubConnection {
  id: string;
  provider: string;
  accountLogin: string | null;
  accountId: string | null;
  tokenHint: string;
  scopes: string[];
  status: 'unverified' | 'valid' | 'invalid';
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
}
