export interface Project {
  id: string;
  name: string;
  description: string | null;
  role?: ProjectMemberRole;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
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
  };
}

export interface ApiErrorResponse {
  error: {
    message: string;
    statusCode: number;
    details?: Array<{ path: string; message: string }>;
  };
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
  created_at?: string;
  updated_at?: string;
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

