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
  owner_id: string | null;
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  provider?: string;
  repository?: string;
  serverUrl?: string;
  monitoringEnabled?: boolean;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  provider?: string;
  repository?: string | null;
  serverUrl?: string | null;
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

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  acceptance_criteria?: string[];
  status: TaskStatus;
  priority: TaskPriority;
  estimated_hours: number | null;
  required_skills: string[];
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  task_number?: number;
  created_at: string;
  updated_at: string;
}

export type VerificationVerdict =
  | 'SATISFIED'
  | 'PARTIALLY_SATISFIED'
  | 'UNMET'
  | 'INSUFFICIENT_EVIDENCE'
  | 'ERROR';

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED';

export interface RequirementCoverage {
  requirement: string;
  status: 'SATISFIED' | 'PARTIALLY_SATISFIED' | 'UNMET' | 'INSUFFICIENT_EVIDENCE';
  explanation: string;
  evidence: string[];
  confidence: number;
}

export interface FileAnalysis {
  filePath: string;
  changeType: 'added' | 'modified' | 'deleted' | 'removed' | 'renamed';
  relevance: string;
  summary: string;
}

export interface GapsAndRisks {
  missingRequirements: string[];
  potentialRegressionsOrSecurity: string[];
  areasRequiringTesting: string[];
  limitations: string[];
}

export interface TaskVerification {
  id: string;
  task_id: string;
  project_id: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  overall_verdict: VerificationVerdict;
  summary: string;
  confidence_score: number | null;
  requirements_coverage: RequirementCoverage[];
  inspected_files: FileAnalysis[];
  gaps_and_risks: GapsAndRisks;
  limitations: string | null;
  recommendation: string;
  associated_commit_shas: string[];
  associated_pr_numbers: number[];
  diff_stats: {
    totalFiles?: number;
    additions?: number;
    deletions?: number;
    totalChanges?: number;
  };
  raw_error: string | null;
  triggered_by_user_id: string | null;
  triggered_by_name?: string | null;
  reviewed_by_user_id: string | null;
  reviewer_name?: string | null;
  review_decision: ReviewDecision | null;
  review_feedback: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  is_stale?: boolean;
}

export interface ReviewSubmissionInput {
  decision: ReviewDecision;
  feedback?: string | null;
  acknowledgeStale?: boolean;
}

export interface TaskGitHubActivity {
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

export interface TaskDependencyInfo {
  id: string;
  title: string;
  status: TaskStatus;
  priority?: TaskPriority;
}

export interface TaskDependencySummary {
  id: string;
  title: string;
  status: TaskStatus;
  is_completed: boolean;
}

export interface PersonalTask {
  id: string;
  project_id: string;
  project_name: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimated_hours: number | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  task_number?: number;
  dependencies: TaskDependencySummary[];
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskWithDependencies extends Task {
  depends_on: TaskDependencyInfo[];
  dependent_tasks: TaskDependencyInfo[];
}

export interface TaskDependenciesResponse {
  dependsOn: TaskDependencyInfo[];
  dependentTasks: TaskDependencyInfo[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number;
  requiredSkills?: string[];
  assigneeId?: string;
  parentTaskId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  acceptanceCriteria?: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number | null;
  requiredSkills?: string[];
  assigneeId?: string | null;
  parentTaskId?: string | null;
}

export interface TaskFilterOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
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
  name: string;
  username?: string;
  email: string;
  skills: string[];
  weekly_capacity_hours: number;
  is_available: boolean;
  github_user_id?: string | null;
  github_username?: string | null;
  github_linked_at?: string | null;
  created_at: string;
  last_login_at: string | null;
  updated_at?: string;
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

// AI Planning Types
export interface PlanRequestInput {
  description: string;
  requirements?: string[];
  constraints?: string | null;
  teamSize?: number | null;
  experienceLevel?: string | null;
  preferredStack?: string | null;
}

export interface PlanTask {
  id: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  estimatedHours: number;
  phaseId: string;
  parentTaskId?: string | null;
  dependsOn: string[];
}

export interface PlanPhase {
  id: string;
  name: string;
  description: string;
  tasks: PlanTask[];
}

export interface PlanResponse {
  title: string;
  summary: string;
  assumptions: string[];
  phases: PlanPhase[];
}

export interface ApplyPlanResult {
  success: boolean;
  message: string;
  createdTasksCount: number;
  createdDependenciesCount: number;
}

// Project Member with user skills & capacity
export interface ProjectMemberWithUser {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  user_name: string;
  user_username?: string;
  user_email: string;
  user_skills: string[];
  weekly_capacity_hours: number;
  is_available: boolean;
  created_at: string;
}

export interface AddProjectMemberInput {
  userId?: string;
  username?: string;
  name?: string;
  email?: string;
  role?: ProjectMemberRole;
  skills?: string[];
  weeklyCapacityHours?: number;
  isAvailable?: boolean;
}

// Task Distribution Engine Types
export interface DistributeTasksInput {
  redistributeAssigned?: boolean;
  taskIds?: string[];
  defaultEstimatedHours?: number;
}

export interface DistributionCandidateScore {
  memberId: string;
  memberName: string;
  totalScore: number;
  skillScore: number;
  matchedSkills: string[];
  unmatchedSkills: string[];
  workloadScore: number;
  currentWorkloadHours: number;
  projectedWorkloadHours: number;
  capacityHours: number;
  isOverCapacity: boolean;
  priorityScore: number;
  dependencyScore: number;
  explanation: string;
}

export interface ProposedAssignment {
  taskId: string;
  taskTitle: string;
  taskPriority: TaskPriority;
  estimatedHours: number;
  requiredSkills: string[];
  currentAssigneeId: string | null;
  proposedAssigneeId: string;
  proposedAssigneeName: string;
  score: number;
  rationale: string;
  candidateScores: DistributionCandidateScore[];
  dependencyWarnings: string[];
  capacityWarnings: string[];
}

export interface UnassignedTask {
  taskId: string;
  taskTitle: string;
  taskPriority: TaskPriority;
  estimatedHours: number;
  requiredSkills: string[];
  reason: string;
}

export interface MemberWorkloadSummary {
  memberId: string;
  memberName: string;
  skills: string[];
  capacityHours: number;
  initialWorkloadHours: number;
  proposedWorkloadHours: number;
  assignedTaskCount: number;
  utilizationPercentage: number;
  isOverCapacity: boolean;
  isAvailable: boolean;
}

export interface DistributionPreviewResponse {
  projectId: string;
  evaluatedTasksCount: number;
  proposedAssignmentsCount: number;
  unassignedTasksCount: number;
  proposedAssignments: ProposedAssignment[];
  unassignedTasks: UnassignedTask[];
  memberWorkloadSummaries: MemberWorkloadSummary[];
  generatedAt: string;
}

export interface ApplyDistributionInput {
  assignments: Array<{ taskId: string; assigneeId: string }>;
}

export interface RegisterInput {
  name: string;
  username?: string;
  email: string;
  password: string;
  skills?: string[];
  weeklyCapacityHours?: number;
  isAvailable?: boolean;
}

export interface LoginInput {
  email?: string;
  emailOrUsername?: string;
  password: string;
}

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
