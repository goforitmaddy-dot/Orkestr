import { PlanResponse, PlanTask } from './ai.types';
import { AppError } from '../../middleware/errorHandler';

export function validatePlanIntegrity(plan: PlanResponse): void {
  const phaseIds = new Set<string>();
  const allTasks: PlanTask[] = [];
  const taskIdSet = new Set<string>();
  const taskMap = new Map<string, PlanTask>();

  // 1. Validate Phase IDs
  for (const phase of plan.phases) {
    if (phaseIds.has(phase.id)) {
      throw new AppError(`Duplicate phase identifier in plan: "${phase.id}"`, 400);
    }
    phaseIds.add(phase.id);

    for (const task of phase.tasks) {
      if (taskIdSet.has(task.id)) {
        throw new AppError(`Duplicate task identifier in plan: "${task.id}"`, 400);
      }
      taskIdSet.add(task.id);
      taskMap.set(task.id, task);
      allTasks.push(task);

      // Verify task's phaseId matches its enclosing phase
      if (task.phaseId !== phase.id) {
        throw new AppError(
          `Task "${task.id}" has phaseId "${task.phaseId}" which does not match enclosing phase "${phase.id}"`,
          400
        );
      }
    }
  }

  // 2. Validate Parent Task Relationships
  for (const task of allTasks) {
    if (task.parentTaskId) {
      if (task.parentTaskId === task.id) {
        throw new AppError(`Task "${task.id}" cannot be its own parent`, 400);
      }
      if (!taskMap.has(task.parentTaskId)) {
        throw new AppError(
          `Task "${task.id}" references non-existent parent task "${task.parentTaskId}"`,
          400
        );
      }

      // Check for parent-child cycles
      let currentParentId: string | null = task.parentTaskId;
      const visitedParents = new Set<string>();

      while (currentParentId) {
        if (currentParentId === task.id) {
          throw new AppError(
            `Circular parent hierarchy detected involving task "${task.id}" and parent "${task.parentTaskId}"`,
            400
          );
        }
        if (visitedParents.has(currentParentId)) {
          break;
        }
        visitedParents.add(currentParentId);
        const parentTask = taskMap.get(currentParentId);
        currentParentId = parentTask?.parentTaskId || null;
      }
    }
  }

  // 3. Validate Dependency Relationships & Cycles
  for (const task of allTasks) {
    if (task.dependsOn && task.dependsOn.length > 0) {
      for (const prereqId of task.dependsOn) {
        if (prereqId === task.id) {
          throw new AppError(`Task "${task.id}" cannot depend on itself`, 400);
        }
        if (!taskMap.has(prereqId)) {
          throw new AppError(
            `Task "${task.id}" references non-existent dependency "${prereqId}"`,
            400
          );
        }
      }
    }
  }

  // 4. Graph Cycle Detection on Dependencies (DFS)
  // Adjacency map: taskId -> array of taskIds that it depends on
  const adjList = new Map<string, string[]>();
  for (const task of allTasks) {
    adjList.set(task.id, task.dependsOn || []);
  }

  // State: 0 = unvisited, 1 = visiting (in current DFS stack), 2 = visited
  const visitState = new Map<string, number>();

  const hasCycle = (nodeId: string, stack: string[]): boolean => {
    visitState.set(nodeId, 1);
    stack.push(nodeId);

    const neighbors = adjList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const state = visitState.get(neighbor) || 0;
      if (state === 1) {
        stack.push(neighbor);
        return true;
      }
      if (state === 0) {
        if (hasCycle(neighbor, stack)) {
          return true;
        }
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
          `Dependency cycle detected in plan: ${cycleStack.join(' -> ')}`,
          400
        );
      }
    }
  }
}
