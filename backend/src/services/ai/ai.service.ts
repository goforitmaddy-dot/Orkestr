import crypto from 'crypto';
import { pool } from '../../db';
import { findProjectById } from '../project.service';
import { AppError } from '../../middleware/errorHandler';
import {
  PlanRequestInput,
  PlanResponse,
  planResponseSchema,
  PlanTask,
} from './ai.types';
import { validatePlanIntegrity } from './ai.validator';
import { getAiProvider, AiPlanPromptInput } from './ai.provider';

export interface ApplyPlanResult {
  success: boolean;
  message: string;
  createdTasksCount: number;
  createdDependenciesCount: number;
}

export const generateProjectPlan = async (
  projectId: string,
  input: PlanRequestInput
): Promise<PlanResponse> => {
  // 1. Verify project exists
  const project = await findProjectById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // 2. Prepare AI prompt payload
  const promptInput: AiPlanPromptInput = {
    projectTitle: project.name,
    projectDescription: input.description,
    requirements: input.requirements,
    constraints: input.constraints,
    teamSize: input.teamSize,
    experienceLevel: input.experienceLevel,
    preferredStack: input.preferredStack,
  };

  // 3. Call AI provider
  const rawResponse = await getAiProvider().generatePlan(promptInput);

  // 4. Parse and validate JSON
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawResponse);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Parse error';
    throw new AppError(
      `AI returned invalid JSON: ${msg}`,
      502
    );
  }

  // 5. Validate schema with Zod
  const validationResult = planResponseSchema.safeParse(parsedJson);
  if (!validationResult.success) {
    const errorDetails = validationResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new AppError(`AI generated plan failed schema validation: ${errorDetails}`, 422, {
      errors: validationResult.error.flatten(),
    });
  }

  const plan = validationResult.data;

  // 6. Validate business integrity (cycles, cross-phase consistency, self-refs)
  validatePlanIntegrity(plan);

  return plan;
};

export const applyProjectPlan = async (
  projectId: string,
  plan: PlanResponse
): Promise<ApplyPlanResult> => {
  // 1. Verify project exists
  const project = await findProjectById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  // 2. Validate plan schema & integrity before touching the DB
  const validationResult = planResponseSchema.safeParse(plan);
  if (!validationResult.success) {
    const errorDetails = validationResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new AppError(`Cannot apply invalid plan: ${errorDetails}`, 400, {
      errors: validationResult.error.flatten(),
    });
  }

  validatePlanIntegrity(plan);

  // 3. Flatten tasks and map temporary IDs to database UUIDs
  const allTasks: PlanTask[] = [];
  const tempToDbId = new Map<string, string>();

  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      allTasks.push(task);
      tempToDbId.set(task.id, crypto.randomUUID());
    }
  }

  if (allTasks.length === 0) {
    throw new AppError('Plan contains no tasks to apply', 400);
  }

  // 4. Group tasks by hierarchy level to respect parent foreign keys
  // Level 0: root tasks (no parentTaskId)
  // Level 1+: tasks whose parents were inserted in previous levels
  const insertedTempIds = new Set<string>();
  const levels: PlanTask[][] = [];
  let remainingTasks = [...allTasks];

  while (remainingTasks.length > 0) {
    const currentLevel: PlanTask[] = [];
    const nextRemaining: PlanTask[] = [];

    for (const task of remainingTasks) {
      if (!task.parentTaskId || insertedTempIds.has(task.parentTaskId)) {
        currentLevel.push(task);
      } else {
        nextRemaining.push(task);
      }
    }

    if (currentLevel.length === 0) {
      // Should not happen because validatePlanIntegrity checks for circular parent hierarchies,
      // but guard against infinite loops just in case
      throw new AppError('Unresolvable parent-child hierarchy in plan', 400);
    }

    for (const task of currentLevel) {
      insertedTempIds.add(task.id);
    }

    levels.push(currentLevel);
    remainingTasks = nextRemaining;
  }

  // 5. Execute transactional insert into PostgreSQL
  const client = await pool.connect();
  let createdTasksCount = 0;
  let createdDependenciesCount = 0;

  try {
    await client.query('BEGIN');

    // Insert tasks level by level
    const insertTaskSql = `
      INSERT INTO tasks (
        id,
        project_id,
        parent_task_id,
        title,
        description,
        status,
        priority,
        estimated_hours
      ) VALUES ($1, $2, $3, $4, $5, 'TODO', $6, $7)
    `;

    for (const level of levels) {
      for (const task of level) {
        const dbId = tempToDbId.get(task.id)!;
        const parentDbId = task.parentTaskId ? tempToDbId.get(task.parentTaskId) || null : null;

        await client.query(insertTaskSql, [
          dbId,
          projectId,
          parentDbId,
          task.title.trim(),
          task.description ? task.description.trim() : null,
          task.priority,
          task.estimatedHours,
        ]);
        createdTasksCount++;
      }
    }

    // Insert dependencies
    const insertDepSql = `
      INSERT INTO task_dependencies (task_id, depends_on_task_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `;

    for (const task of allTasks) {
      if (task.dependsOn && task.dependsOn.length > 0) {
        const taskDbId = tempToDbId.get(task.id)!;
        for (const prereqTempId of task.dependsOn) {
          const prereqDbId = tempToDbId.get(prereqTempId);
          if (prereqDbId) {
            await client.query(insertDepSql, [taskDbId, prereqDbId]);
            createdDependenciesCount++;
          }
        }
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: `Successfully applied plan: created ${createdTasksCount} tasks and ${createdDependenciesCount} dependencies.`,
      createdTasksCount,
      createdDependenciesCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
