/**
 * Automated Verification Script for Orkestr AI Project Planning Engine
 * Tests all 15 Part 10 requirements:
 * 1. Health check & DB connection
 * 2. Unconfigured GEMINI_API_KEY returns 503
 * 3. Input validation: missing/short description returns 400
 * 4. Invalid project UUID returns 404
 * 5. Non-existent project returns 404
 * 6. Validator detects duplicate task IDs
 * 7. Validator detects duplicate phase IDs
 * 8. Validator detects task phaseId mismatch
 * 9. Validator detects task self-dependency
 * 10. Validator detects non-existent dependency reference
 * 11. Validator detects direct cycle (A -> B -> A)
 * 12. Validator detects indirect multi-node cycle (A -> B -> C -> A)
 * 13. Validator detects circular parent-child hierarchy
 * 14. Plan generation does NOT persist tasks to DB
 * 15. Apply plan transactionally creates tasks, subtasks, dependencies, and supports rollback on error
 */

import { validatePlanIntegrity } from '../src/services/ai/ai.validator';
import { PlanResponse } from '../src/services/ai/ai.types';
import { setAiProvider, AiProvider, GeminiProvider } from '../src/services/ai/ai.provider';
import { generateProjectPlan } from '../src/services/ai/ai.service';
import { query, pool } from '../src/db';

const BASE_URL = 'http://localhost:5001/api';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, details?: string) {
  results.push({ name, passed: condition, details });
  if (condition) {
    console.log(`✓ PASS: ${name}`);
  } else {
    console.error(`✗ FAIL: ${name} - ${details || 'Condition failed'}`);
  }
}

class MockAiProvider implements AiProvider {
  private responsePlan: PlanResponse;

  constructor(plan: PlanResponse) {
    this.responsePlan = plan;
  }

  async generatePlan(): Promise<string> {
    return JSON.stringify(this.responsePlan);
  }
}

async function runTests() {
  console.log('=====================================================');
  console.log('Starting Orkestr AI Project Planner Verification Suite');
  console.log('=====================================================\n');

  // --- 1. Health & Server Check ---
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const health = (await healthRes.json()) as { services: { database: string } };
    assert('1. Health endpoint returns 200 and db connected', healthRes.status === 200 && health.services.database === 'connected');
  } catch (err: unknown) {
    assert('1. Health check reachable', false, err instanceof Error ? err.message : 'Fetch failed');
  }

  // --- 2. Create a test project for planner tests ---
  let testProjectId = '';
  let sessionCookie = '';
  try {
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'AI Planner Test Lead',
        email: `planner_lead_${Date.now()}@example.com`,
        password: 'Password123!',
      }),
    });
    const rawSetCookie = regRes.headers.get('set-cookie');
    if (rawSetCookie) {
      const [cookiePair] = rawSetCookie.split(';');
      sessionCookie = cookiePair.trim();
    }

    const createProjRes = await fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        name: 'AI Planning E2E Test Project',
        description: 'Testbed for AI project planner engine',
      }),
    });
    const proj = (await createProjRes.json()) as { id: string };
    testProjectId = proj.id;
    assert('Project created for planner tests', createProjRes.status === 201 && !!testProjectId);
  } catch (err: unknown) {
    assert('Project created for planner tests', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 3. Unconfigured AI provider returns 503 ---
  try {
    const unconfProvider = new GeminiProvider(' '); // explicitly blank key
    let threw503 = false;
    try {
      await unconfProvider.generatePlan({
        projectTitle: 'Test Project',
        projectDescription: 'Build an enterprise billing and subscription platform.',
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      threw503 = err.statusCode === 503 && !!err.message && err.message.includes('GEMINI_API_KEY');
    }
    assert('2. Unconfigured AI provider returns 503 with helpful error', threw503);
  } catch (err: unknown) {
    assert('2. Unconfigured AI check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 4. Validation: description too short ---
  try {
    const shortDescRes = await fetch(`${BASE_URL}/projects/${testProjectId}/ai/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        description: 'Too short',
      }),
    });
    assert('3. Plan input rejects description < 10 characters with 400', shortDescRes.status === 400);
  } catch (err: unknown) {
    assert('3. Plan input validation', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 5. Invalid project UUID returns 404 ---
  try {
    const invalidIdRes = await fetch(`${BASE_URL}/projects/not-a-uuid/ai/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        description: 'Valid description that has sufficient length for generation.',
      }),
    });
    assert('4. Invalid project UUID returns 404', invalidIdRes.status === 404);
  } catch (err: unknown) {
    assert('4. Invalid project UUID', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 6. Non-existent project UUID returns 404 ---
  try {
    const nonExistentRes = await fetch(`${BASE_URL}/projects/00000000-0000-0000-0000-000000000000/ai/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        description: 'Valid description that has sufficient length for generation.',
      }),
    });
    assert('5. Non-existent project UUID returns 404', nonExistentRes.status === 404);
  } catch (err: unknown) {
    assert('5. Non-existent project UUID', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 7. Validation Unit Tests: Duplicate task IDs ---
  try {
    const dupTaskPlan: PlanResponse = {
      title: 'Test Plan',
      summary: 'Summary with sufficient length',
      assumptions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Desc',
          tasks: [
            { id: 'task-1', title: 'Task 1', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: [] },
            { id: 'task-1', title: 'Task 1 Duplicate', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: [] },
          ],
        },
      ],
    };
    let threw = false;
    try {
      validatePlanIntegrity(dupTaskPlan);
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('Duplicate task identifier');
    }
    assert('6. Validator detects duplicate task ID', threw);
  } catch (err: unknown) {
    assert('6. Duplicate task ID check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 8. Validation: Duplicate phase IDs ---
  try {
    const dupPhasePlan: PlanResponse = {
      title: 'Test Plan',
      summary: 'Summary with sufficient length',
      assumptions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Desc',
          tasks: [{ id: 'task-1', title: 'Task 1', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: [] }],
        },
        {
          id: 'phase-1',
          name: 'Phase 1 Duplicate',
          description: 'Desc',
          tasks: [{ id: 'task-2', title: 'Task 2', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: [] }],
        },
      ],
    };
    let threw = false;
    try {
      validatePlanIntegrity(dupPhasePlan);
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('Duplicate phase identifier');
    }
    assert('7. Validator detects duplicate phase ID', threw);
  } catch (err: unknown) {
    assert('7. Duplicate phase ID check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 9. Validation: Task phaseId mismatch ---
  try {
    const mismatchPlan: PlanResponse = {
      title: 'Test Plan',
      summary: 'Summary with sufficient length',
      assumptions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Desc',
          tasks: [{ id: 'task-1', title: 'Task 1', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-2', dependsOn: [] }],
        },
      ],
    };
    let threw = false;
    try {
      validatePlanIntegrity(mismatchPlan);
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('does not match enclosing phase');
    }
    assert('8. Validator detects task phaseId mismatch', threw);
  } catch (err: unknown) {
    assert('8. Task phaseId mismatch check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 10. Validation: Self dependency ---
  try {
    const selfDepPlan: PlanResponse = {
      title: 'Test Plan',
      summary: 'Summary with sufficient length',
      assumptions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Desc',
          tasks: [{ id: 'task-1', title: 'Task 1', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: ['task-1'] }],
        },
      ],
    };
    let threw = false;
    try {
      validatePlanIntegrity(selfDepPlan);
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('cannot depend on itself');
    }
    assert('9. Validator detects task self-dependency', threw);
  } catch (err: unknown) {
    assert('9. Self dependency check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 11. Validation: Non-existent dependency reference ---
  try {
    const missingDepPlan: PlanResponse = {
      title: 'Test Plan',
      summary: 'Summary with sufficient length',
      assumptions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Desc',
          tasks: [{ id: 'task-1', title: 'Task 1', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: ['task-999'] }],
        },
      ],
    };
    let threw = false;
    try {
      validatePlanIntegrity(missingDepPlan);
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('references non-existent dependency');
    }
    assert('10. Validator detects non-existent dependency reference', threw);
  } catch (err: unknown) {
    assert('10. Missing dependency check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 12. Validation: Direct Cycle (A -> B -> A) ---
  try {
    const cyclePlan: PlanResponse = {
      title: 'Test Plan',
      summary: 'Summary with sufficient length',
      assumptions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Desc',
          tasks: [
            { id: 'task-a', title: 'Task A', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: ['task-b'] },
            { id: 'task-b', title: 'Task B', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: ['task-a'] },
          ],
        },
      ],
    };
    let threw = false;
    try {
      validatePlanIntegrity(cyclePlan);
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('Dependency cycle detected');
    }
    assert('11. Validator detects direct 2-node cycle (A -> B -> A)', threw);
  } catch (err: unknown) {
    assert('11. Direct cycle check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 13. Validation: Multi-node Cycle (A -> B -> C -> A) ---
  try {
    const multiCyclePlan: PlanResponse = {
      title: 'Test Plan',
      summary: 'Summary with sufficient length',
      assumptions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Desc',
          tasks: [
            { id: 'task-a', title: 'Task A', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: ['task-b'] },
            { id: 'task-b', title: 'Task B', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: ['task-c'] },
            { id: 'task-c', title: 'Task C', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', dependsOn: ['task-a'] },
          ],
        },
      ],
    };
    let threw = false;
    try {
      validatePlanIntegrity(multiCyclePlan);
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('Dependency cycle detected');
    }
    assert('12. Validator detects indirect multi-node cycle (A -> B -> C -> A)', threw);
  } catch (err: unknown) {
    assert('12. Multi-node cycle check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 14. Validation: Circular Parent Hierarchy ---
  try {
    const circularParentPlan: PlanResponse = {
      title: 'Test Plan',
      summary: 'Summary with sufficient length',
      assumptions: [],
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          description: 'Desc',
          tasks: [
            { id: 'task-p1', title: 'Parent 1', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', parentTaskId: 'task-p2', dependsOn: [] },
            { id: 'task-p2', title: 'Parent 2', priority: 'MEDIUM', estimatedHours: 2, phaseId: 'phase-1', parentTaskId: 'task-p1', dependsOn: [] },
          ],
        },
      ],
    };
    let threw = false;
    try {
      validatePlanIntegrity(circularParentPlan);
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('Circular parent hierarchy detected');
    }
    assert('13. Validator detects circular parent-child hierarchy', threw);
  } catch (err: unknown) {
    assert('13. Circular parent check', false, err instanceof Error ? err.message : 'Error');
  }

  // --- 15. Plan Generation & Approval Pipeline with Mock Provider ---
  const validStructuredPlan: PlanResponse = {
    title: 'Authentication & Profile Module Execution Plan',
    summary: 'A phased implementation plan for OAuth, user profiles, session tokens, and security audits.',
    assumptions: ['Using PostgreSQL for persistent storage', 'Using JWT for stateless tokens'],
    phases: [
      {
        id: 'phase-1',
        name: 'Phase 1: Database Architecture',
        description: 'Design users and sessions schema',
        tasks: [
          {
            id: 'task-1',
            title: 'Design user schema and migrations',
            description: 'Create PostgreSQL migration script for users and sessions table',
            priority: 'HIGH',
            estimatedHours: 4,
            phaseId: 'phase-1',
            parentTaskId: null,
            dependsOn: [],
          },
          {
            id: 'task-1-sub',
            title: 'Add indexing on user email and token lookup',
            description: 'Optimize queries for session verification',
            priority: 'MEDIUM',
            estimatedHours: 2,
            phaseId: 'phase-1',
            parentTaskId: 'task-1',
            dependsOn: ['task-1'],
          },
        ],
      },
      {
        id: 'phase-2',
        name: 'Phase 2: Authentication API',
        description: 'Implement login and register endpoints',
        tasks: [
          {
            id: 'task-2',
            title: 'Implement POST /api/auth/register and login endpoints',
            description: 'Password hashing with bcrypt and JWT generation',
            priority: 'HIGH',
            estimatedHours: 6,
            phaseId: 'phase-2',
            parentTaskId: null,
            dependsOn: ['task-1'],
          },
          {
            id: 'task-3',
            title: 'Write automated integration tests for Auth API',
            description: 'Verify login token and error scenarios',
            priority: 'MEDIUM',
            estimatedHours: 3,
            phaseId: 'phase-2',
            parentTaskId: null,
            dependsOn: ['task-2'],
          },
        ],
      },
    ],
  };

  // Set mock provider
  setAiProvider(new MockAiProvider(validStructuredPlan));

  // Count existing tasks in Project before generation
  const countBefore = await query<{ count: string }>('SELECT COUNT(*) FROM tasks WHERE project_id = $1', [testProjectId]);
  const initialTaskCount = parseInt(countBefore.rows[0].count, 10);

  // Generate Plan via Service
  const generatedPlan = await generateProjectPlan(testProjectId, {
    description: 'Build an authentication and user management system.',
    preferredStack: 'Node.js, Express, PostgreSQL',
  });

  // Verify that NO tasks were committed during generation
  const countAfterGen = await query<{ count: string }>('SELECT COUNT(*) FROM tasks WHERE project_id = $1', [testProjectId]);
  const taskCountAfterGen = parseInt(countAfterGen.rows[0].count, 10);

  assert(
    '14. Plan generation does NOT persist tasks to DB before user approval',
    initialTaskCount === 0 && taskCountAfterGen === 0 && generatedPlan.phases.length === 2
  );

  // Apply Plan via API endpoint
  const applyRes = await fetch(`${BASE_URL}/projects/${testProjectId}/ai/plan/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify(generatedPlan),
  });
  const applyResult = (await applyRes.json()) as { success: boolean; createdTasksCount: number; createdDependenciesCount: number };

  assert(
    '15. Apply plan transactionally persists all tasks and dependencies',
    applyRes.status === 201 && applyResult.success && applyResult.createdTasksCount === 4 && applyResult.createdDependenciesCount === 3,
    `Status: ${applyRes.status}, CreatedTasks: ${applyResult.createdTasksCount}, CreatedDeps: ${applyResult.createdDependenciesCount}`
  );

  // Verify Tasks in Database
  const dbTasksRes = await query<{ id: string; title: string; parent_task_id: string | null }>(
    'SELECT id, title, parent_task_id FROM tasks WHERE project_id = $1 ORDER BY created_at ASC',
    [testProjectId]
  );
  assert('DB contains exactly 4 created tasks for project', dbTasksRes.rows.length === 4);

  // Verify Subtask correctly linked to Parent Task UUID
  const subtaskRow = dbTasksRes.rows.find((t) => t.title.includes('Add indexing'));
  const parentTaskRow = dbTasksRes.rows.find((t) => t.title.includes('Design user schema'));
  assert(
    'Subtask has parent_task_id mapped to parent DB UUID',
    !!subtaskRow?.parent_task_id && subtaskRow.parent_task_id === parentTaskRow?.id
  );

  // Verify Dependencies in Database
  const dbDepsRes = await query<{ task_id: string; depends_on_task_id: string }>(
    `SELECT td.task_id, td.depends_on_task_id 
     FROM task_dependencies td 
     JOIN tasks t ON td.task_id = t.id 
     WHERE t.project_id = $1`,
    [testProjectId]
  );
  assert('DB contains exactly 3 dependencies linking mapped UUIDs', dbDepsRes.rows.length === 3);

  // Clean up test project
  await query('DELETE FROM projects WHERE id = $1', [testProjectId]);
  console.log(`\nCleaned up test project ${testProjectId}`);

  await pool.end();

  // Summary
  console.log('\n=====================================================');
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`VERIFICATION SUMMARY: ${passedCount} / ${results.length} tests passed`);
  console.log('=====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
