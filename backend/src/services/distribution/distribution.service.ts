import { pool, query } from '../../db';
import { findProjectById } from '../project.service';
import { findTasksByProjectId, Task } from '../task.service';
import { findProjectMembers } from '../member.service';
import { AppError } from '../../middleware/errorHandler';
import {
  DistributeTasksInput,
  DistributionPreviewResponse,
  ProposedAssignment,
  UnassignedTask,
  MemberWorkloadSummary,
  ApplyDistributionInput,
} from './distribution.types';
import { calculateCandidateScore, sortCandidates } from './distribution.scoring';

export const previewTaskDistribution = async (
  projectId: string,
  input: DistributeTasksInput
): Promise<DistributionPreviewResponse> => {
  // 1. Verify project exists
  const project = await findProjectById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // 2. Fetch project members
  const members = await findProjectMembers(projectId);
  if (members.length === 0) {
    throw new AppError(
      'Cannot distribute tasks: Project has no team members. Add members to the project first.',
      400
    );
  }

  // 3. Fetch project tasks
  const allTasks = await findTasksByProjectId(projectId);
  if (allTasks.length === 0) {
    return {
      projectId,
      evaluatedTasksCount: 0,
      proposedAssignmentsCount: 0,
      unassignedTasksCount: 0,
      proposedAssignments: [],
      unassignedTasks: [],
      memberWorkloadSummaries: members.map((m) => ({
        memberId: m.user_id,
        memberName: m.user_name,
        skills: m.user_skills || [],
        capacityHours: m.weekly_capacity_hours || 40,
        initialWorkloadHours: 0,
        proposedWorkloadHours: 0,
        assignedTaskCount: 0,
        utilizationPercentage: 0,
        isOverCapacity: false,
        isAvailable: m.is_available,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // 4. Fetch task dependencies
  const depsRes = await query<{ task_id: string; depends_on_task_id: string }>(
    `SELECT td.task_id, td.depends_on_task_id 
     FROM task_dependencies td 
     JOIN tasks t ON td.task_id = t.id 
     WHERE t.project_id = $1`,
    [projectId]
  );

  // Check for dependency cycles in project
  const adjList = new Map<string, string[]>();
  for (const dep of depsRes.rows) {
    const list = adjList.get(dep.task_id) || [];
    list.push(dep.depends_on_task_id);
    adjList.set(dep.task_id, list);
  }

  const visitState = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
  const hasCycle = (nodeId: string, stack: string[]): boolean => {
    visitState.set(nodeId, 1);
    stack.push(nodeId);
    for (const neighbor of adjList.get(nodeId) || []) {
      const state = visitState.get(neighbor) || 0;
      if (state === 1) {
        stack.push(neighbor);
        return true;
      }
      if (state === 0 && hasCycle(neighbor, stack)) {
        return true;
      }
    }
    visitState.set(nodeId, 2);
    stack.pop();
    return false;
  };

  for (const task of allTasks) {
    if ((visitState.get(task.id) || 0) === 0) {
      const cycleStack: string[] = [];
      if (hasCycle(task.id, cycleStack)) {
        throw new AppError(
          `Cannot distribute tasks: Dependency cycle detected in project tasks (${cycleStack.join(' -> ')})`,
          400
        );
      }
    }
  }

  // 5. Filter tasks eligible for distribution
  const defaultEstimate = input.defaultEstimatedHours || 4;
  let targetTasks: Task[] = allTasks.filter((t) => t.status !== 'DONE');

  if (input.taskIds && input.taskIds.length > 0) {
    const requestedIdSet = new Set(input.taskIds);
    targetTasks = targetTasks.filter((t) => requestedIdSet.has(t.id));
  }

  if (!input.redistributeAssigned) {
    // Only unassigned tasks
    targetTasks = targetTasks.filter((t) => !t.assignee_id);
  }

  const targetTaskIdSet = new Set(targetTasks.map((t) => t.id));

  // 6. Calculate initial workloads for members
  // Only tasks NOT in targetTasks count towards initial baseline
  const memberWorkload = new Map<string, number>();
  const memberInitialWorkload = new Map<string, number>();
  const memberTaskCount = new Map<string, number>();

  for (const m of members) {
    memberWorkload.set(m.user_id, 0);
    memberInitialWorkload.set(m.user_id, 0);
    memberTaskCount.set(m.user_id, 0);
  }

  for (const t of allTasks) {
    if (t.assignee_id && t.status !== 'DONE') {
      const isBeingRedistributed = targetTaskIdSet.has(t.id);
      if (!isBeingRedistributed && memberWorkload.has(t.assignee_id)) {
        const hours = t.estimated_hours || defaultEstimate;
        const current = memberWorkload.get(t.assignee_id) || 0;
        memberWorkload.set(t.assignee_id, current + hours);
        memberInitialWorkload.set(t.assignee_id, current + hours);
        memberTaskCount.set(t.assignee_id, (memberTaskCount.get(t.assignee_id) || 0) + 1);
      }
    }
  }

  // 7. Sort tasks deterministically in dependency order and priority
  // Build in-degree map (number of uncompleted prerequisites)
  const taskMap = new Map<string, Task>(allTasks.map((t) => [t.id, t]));
  const inDegree = new Map<string, number>();
  for (const t of targetTasks) {
    const prereqs = (adjList.get(t.id) || []).filter((prereqId) => {
      const pTask = taskMap.get(prereqId);
      return pTask && pTask.status !== 'DONE';
    });
    inDegree.set(t.id, prereqs.length);
  }

  const priorityWeights: Record<string, number> = {
    URGENT: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  targetTasks.sort((a, b) => {
    // 1. Dependency order (tasks with 0 blockers first)
    const degA = inDegree.get(a.id) || 0;
    const degB = inDegree.get(b.id) || 0;
    if (degA !== degB) {
      return degA - degB;
    }
    // 2. Priority descending (URGENT first)
    const prioA = priorityWeights[a.priority] || 2;
    const prioB = priorityWeights[b.priority] || 2;
    if (prioB !== prioA) {
      return prioB - prioA;
    }
    // 3. Estimated hours descending (larger tasks scheduled first)
    const hrsA = a.estimated_hours || defaultEstimate;
    const hrsB = b.estimated_hours || defaultEstimate;
    if (hrsB !== hrsA) {
      return hrsB - hrsA;
    }
    // 4. Creation time / ID (deterministic tie-breaker)
    return a.id.localeCompare(b.id);
  });

  // Track tentative assignments during preview loop
  const tentativeAssignments = new Map<string, string>(); // taskId -> assigneeId
  const proposedAssignments: ProposedAssignment[] = [];
  const unassignedTasks: UnassignedTask[] = [];

  // 8. Run distribution algorithm for each task
  for (const task of targetTasks) {
    const taskEstimate = task.estimated_hours || defaultEstimate;
    const taskRequiredSkills = (task.required_skills || []).map((s) => s.trim().toLowerCase()).filter(Boolean);

    // Identify prerequisite assignees
    const prereqIds = adjList.get(task.id) || [];
    const prereqAssigneeIds: string[] = [];
    const unfinishedPrereqTitles: string[] = [];

    for (const pId of prereqIds) {
      const pTask = taskMap.get(pId);
      if (pTask && pTask.status !== 'DONE') {
        unfinishedPrereqTitles.push(pTask.title);
        const assignee = tentativeAssignments.get(pId) || pTask.assignee_id;
        if (assignee) {
          prereqAssigneeIds.push(assignee);
        }
      }
    }

    // Score each candidate member
    const candidateScores = members.map((member) => {
      const currentLoad = memberWorkload.get(member.user_id) || 0;
      return calculateCandidateScore({
        task,
        member,
        currentWorkloadHours: currentLoad,
        taskEstimate,
        prerequisiteAssigneeIds: prereqAssigneeIds,
      });
    });

    const sortedCandidates = sortCandidates(candidateScores);

    // Filter eligible candidates
    // A candidate is eligible if:
    // 1. is_available is true (not marked unavailable)
    // 2. If task requires skills, candidate matches at least ONE skill
    const eligibleCandidates = sortedCandidates.filter((cand) => {
      const member = members.find((m) => m.user_id === cand.memberId);
      if (!member || !member.is_available) return false;
      if (taskRequiredSkills.length > 0 && cand.matchedSkills.length === 0) return false;
      return true;
    });

    if (eligibleCandidates.length === 0) {
      let reason = 'No eligible project members available';
      if (taskRequiredSkills.length > 0) {
        reason = `No available project member possesses any of the required skills (${task.required_skills.join(', ')})`;
      } else if (members.every((m) => !m.is_available)) {
        reason = 'All project members are marked as unavailable';
      }

      unassignedTasks.push({
        taskId: task.id,
        taskTitle: task.title,
        taskPriority: task.priority,
        estimatedHours: taskEstimate,
        requiredSkills: task.required_skills || [],
        reason,
      });
      continue;
    }

    // Top eligible candidate chosen
    const winner = eligibleCandidates[0];
    tentativeAssignments.set(task.id, winner.memberId);

    // Update workload for chosen member
    const newLoad = (memberWorkload.get(winner.memberId) || 0) + taskEstimate;
    memberWorkload.set(winner.memberId, newLoad);
    memberTaskCount.set(winner.memberId, (memberTaskCount.get(winner.memberId) || 0) + 1);

    // Warnings
    const dependencyWarnings: string[] = [];
    if (unfinishedPrereqTitles.length > 0) {
      dependencyWarnings.push(
        `Blocked by ${unfinishedPrereqTitles.length} unfinished prerequisite task(s): "${unfinishedPrereqTitles.join('", "')}"`
      );
    }

    // No capacity limit warnings; workload is balanced smoothly without capping
    const capacityWarnings: string[] = [];

    // Rationale description
    const rationaleParts: string[] = [
      `Assigned to ${winner.memberName} (Rank #1, Score: ${winner.totalScore})`,
    ];
    if (taskRequiredSkills.length > 0) {
      rationaleParts.push(`matched ${winner.matchedSkills.length}/${taskRequiredSkills.length} required skill(s)`);
    } else {
      rationaleParts.push('selected based on workload balance');
    }
    rationaleParts.push(`Projected load: ${newLoad}h`);

    proposedAssignments.push({
      taskId: task.id,
      taskTitle: task.title,
      taskPriority: task.priority,
      estimatedHours: taskEstimate,
      requiredSkills: task.required_skills || [],
      currentAssigneeId: task.assignee_id,
      proposedAssigneeId: winner.memberId,
      proposedAssigneeName: winner.memberName,
      score: winner.totalScore,
      rationale: rationaleParts.join('. ') + '.',
      candidateScores: sortedCandidates,
      dependencyWarnings,
      capacityWarnings,
    });
  }

  // 9. Build member workload summaries
  const memberWorkloadSummaries: MemberWorkloadSummary[] = members.map((m) => {
    const initHours = memberInitialWorkload.get(m.user_id) || 0;
    const propHours = memberWorkload.get(m.user_id) || 0;
    const capacity = m.weekly_capacity_hours || 40;
    const count = memberTaskCount.get(m.user_id) || 0;

    return {
      memberId: m.user_id,
      memberName: m.user_name,
      skills: m.user_skills || [],
      capacityHours: capacity,
      initialWorkloadHours: initHours,
      proposedWorkloadHours: propHours,
      assignedTaskCount: count,
      utilizationPercentage: count > 0 ? 100 : 0,
      isOverCapacity: false,
      isAvailable: m.is_available,
    };
  });

  return {
    projectId,
    evaluatedTasksCount: targetTasks.length,
    proposedAssignmentsCount: proposedAssignments.length,
    unassignedTasksCount: unassignedTasks.length,
    proposedAssignments,
    unassignedTasks,
    memberWorkloadSummaries,
    generatedAt: new Date().toISOString(),
  };
};

export const applyTaskDistribution = async (
  projectId: string,
  input: ApplyDistributionInput
): Promise<{ success: boolean; message: string; updatedCount: number }> => {
  // 1. Verify project exists
  const project = await findProjectById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // 2. Fetch project members & tasks for validation
  const members = await findProjectMembers(projectId);
  const memberUserIds = new Set(members.map((m) => m.user_id));

  const allTasks = await findTasksByProjectId(projectId);
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));

  // 3. Validate every assignment request
  for (const item of input.assignments) {
    if (!taskMap.has(item.taskId)) {
      throw new AppError(
        `Task "${item.taskId}" does not exist in this project`,
        400
      );
    }
    if (!memberUserIds.has(item.assigneeId)) {
      throw new AppError(
        `Assignee "${item.assigneeId}" is not an active member of this project`,
        400
      );
    }
  }

  // 4. Transactional update in PostgreSQL
  const client = await pool.connect();
  let updatedCount = 0;

  try {
    await client.query('BEGIN');

    const updateSql = `
      UPDATE tasks 
      SET assignee_id = $1, updated_at = NOW() 
      WHERE id = $2 AND project_id = $3
    `;

    for (const item of input.assignments) {
      const res = await client.query(updateSql, [item.assigneeId, item.taskId, projectId]);
      if (res.rowCount && res.rowCount > 0) {
        updatedCount++;
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: `Successfully applied ${updatedCount} task assignment(s).`,
      updatedCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
