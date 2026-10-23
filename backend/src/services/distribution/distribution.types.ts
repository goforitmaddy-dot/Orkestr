import { z } from 'zod';
import { TaskPriority } from '../task.service';

export const distributeTasksInputSchema = z.object({
  redistributeAssigned: z.boolean().default(false),
  taskIds: z.array(z.string().uuid()).optional(),
  defaultEstimatedHours: z.number().positive().default(4),
});

export type DistributeTasksInput = z.infer<typeof distributeTasksInputSchema>;

export const applyDistributionSchema = z.object({
  assignments: z
    .array(
      z.object({
        taskId: z.string().uuid('Invalid task ID'),
        assigneeId: z.string().uuid('Invalid assignee ID'),
      })
    )
    .min(1, 'At least one task assignment must be provided'),
});

export type ApplyDistributionInput = z.infer<typeof applyDistributionSchema>;

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
