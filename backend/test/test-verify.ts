/**
 * Comprehensive Automated Verification Script for Orkestr Tasks & Dependencies
 * Tests points 1 through 15, validating all constraints, edge cases, cycles, and CRUD.
 */

const BASE_URL = 'http://localhost:5001/api';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

let sessionCookie = '';

async function authFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...(options.headers || {}),
    },
  });
}

async function assert(name: string, condition: boolean, details?: string) {
  results.push({ name, passed: condition, details });
  if (condition) {
    console.log(`✓ PASS: ${name}`);
  } else {
    console.error(`✗ FAIL: ${name} - ${details || 'Condition failed'}`);
  }
}

async function runTests() {
  console.log('--- Starting Comprehensive API & Task Verification ---');

  // 1. Health check
  const healthRes = await fetch(`${BASE_URL}/health`);
  const health = await healthRes.json();
  await assert(
    'Health endpoint returns 200 and db connected',
    healthRes.status === 200 && health.services.database === 'connected'
  );

  // Authenticate session for verification user
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Verification Bot',
      email: `verify_${Date.now()}@example.com`,
      password: 'Password123!',
    }),
  });
  const rawSetCookie = regRes.headers.get('set-cookie');
  if (rawSetCookie) {
    const [cookiePair] = rawSetCookie.split(';');
    sessionCookie = cookiePair.trim();
  }

  // 2. Existing project CRUD check
  const projectsRes = await authFetch(`${BASE_URL}/projects`);
  const initialProjects = await projectsRes.json();
  await assert('Projects endpoint returns valid array', Array.isArray(initialProjects));

  // Create Project A
  const createProjARes = await authFetch(`${BASE_URL}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Verification Project A', description: 'Testing Task Flow' }),
  });
  const projA = await createProjARes.json();
  await assert('Project A created successfully', createProjARes.status === 201 && !!projA.id);

  // Create Project B (for cross-project dependency testing)
  const createProjBRes = await authFetch(`${BASE_URL}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Verification Project B', description: 'Testing Cross Project' }),
  });
  const projB = await createProjBRes.json();
  await assert('Project B created successfully', createProjBRes.status === 201 && !!projB.id);

  // 3. Task creation in Project A
  const createTask1Res = await authFetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Database Schema Setup',
      description: 'Setup tables and indexes',
      status: 'TODO',
      priority: 'HIGH',
      estimatedHours: 4.5,
    }),
  });
  const task1 = await createTask1Res.json();
  await assert(
    'Task 1 created in Project A',
    createTask1Res.status === 201 && task1.title === 'Database Schema Setup'
  );

  const createTask2Res = await authFetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Backend API Implementation',
      description: 'REST routes for tasks',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      estimatedHours: 6,
    }),
  });
  const task2 = await createTask2Res.json();
  await assert(
    'Task 2 created in Project A',
    createTask2Res.status === 201 && task2.title === 'Backend API Implementation'
  );

  const createTask3Res = await authFetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Frontend UI Integration',
      description: 'React components',
      status: 'TODO',
      priority: 'LOW',
      estimatedHours: 3,
    }),
  });
  const task3 = await createTask3Res.json();
  await assert(
    'Task 3 created in Project A',
    createTask3Res.status === 201 && task3.title === 'Frontend UI Integration'
  );

  // Task in Project B
  const createTaskBRes = await authFetch(`${BASE_URL}/projects/${projB.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Project B Task',
      status: 'TODO',
    }),
  });
  const taskB = await createTaskBRes.json();
  await assert('Task in Project B created', createTaskBRes.status === 201 && !!taskB.id);

  // 4. Task listing and filters
  const listTasksRes = await authFetch(`${BASE_URL}/projects/${projA.id}/tasks`);
  const allTasksProjA = await listTasksRes.json();
  await assert(
    'List tasks in Project A returns 3 tasks',
    Array.isArray(allTasksProjA) && allTasksProjA.length === 3
  );

  const filterStatusRes = await authFetch(
    `${BASE_URL}/projects/${projA.id}/tasks?status=IN_PROGRESS`
  );
  const inProgressTasks = await filterStatusRes.json();
  await assert(
    'Status filter works',
    inProgressTasks.length === 1 && inProgressTasks[0].status === 'IN_PROGRESS'
  );

  const filterPriorityRes = await authFetch(`${BASE_URL}/projects/${projA.id}/tasks?priority=HIGH`);
  const highPriorityTasks = await filterPriorityRes.json();
  await assert(
    'Priority filter works',
    highPriorityTasks.length === 1 && highPriorityTasks[0].priority === 'HIGH'
  );

  // 5. Task updates
  const updateTaskRes = await authFetch(`${BASE_URL}/tasks/${task1.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'DONE', estimatedHours: 5 }),
  });
  const updatedTask1 = await updateTaskRes.json();
  await assert(
    'Task update succeeds',
    updateTaskRes.status === 200 &&
      updatedTask1.status === 'DONE' &&
      updatedTask1.estimated_hours === 5
  );

  // 6. Subtask & Parent Task relationships
  const createSubtaskRes = await authFetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Subtask of Task 2',
      parentTaskId: task2.id,
      status: 'TODO',
    }),
  });
  const subtask = await createSubtaskRes.json();
  await assert(
    'Subtask created successfully with parentTaskId',
    createSubtaskRes.status === 201 && subtask.parent_task_id === task2.id
  );

  // 7. Prevent self-parenting
  const selfParentRes = await authFetch(`${BASE_URL}/tasks/${task1.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentTaskId: task1.id }),
  });
  await assert('Self-parenting rejected with 400', selfParentRes.status === 400);

  // 8. Prevent cross-project parenting
  const crossProjectParentRes = await authFetch(`${BASE_URL}/tasks/${taskB.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentTaskId: task1.id }),
  });
  await assert(
    'Cross-project parent rejected with 400',
    crossProjectParentRes.status === 400
  );

  // 9. Task Dependencies
  const addDepRes = await authFetch(`${BASE_URL}/tasks/${task2.id}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ dependsOnTaskId: task1.id }),
  });
  const depData = await addDepRes.json();
  await assert(
    'Dependency added: Task 2 depends on Task 1',
    addDepRes.status === 201 && depData.task_id === task2.id && depData.depends_on_task_id === task1.id
  );

  // 10. Self-dependency rejected
  const selfDepRes = await authFetch(`${BASE_URL}/tasks/${task1.id}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ dependsOnTaskId: task1.id }),
  });
  await assert('Self-dependency rejected with 400', selfDepRes.status === 400);

  // 11. Cross-project dependency rejected
  const crossDepRes = await authFetch(`${BASE_URL}/tasks/${taskB.id}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ dependsOnTaskId: task1.id }),
  });
  await assert('Cross-project dependency rejected with 400', crossDepRes.status === 400);

  // task3 depends on task2 (Chain: task1 -> task2 -> task3)
  const addDep2Res = await authFetch(`${BASE_URL}/tasks/${task3.id}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ dependsOnTaskId: task2.id }),
  });
  await assert('Chained dependency (task3 depends on task2) added', addDep2Res.status === 201);

  // 12. Dependency cycle rejected: task1 depends on task3!
  const cycleDepRes = await authFetch(`${BASE_URL}/tasks/${task1.id}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ dependsOnTaskId: task3.id }),
  });
  await assert(
    'Circular dependency (task1 depends on task3) rejected with 400',
    cycleDepRes.status === 400
  );

  // 13. Retrieve task with dependency information
  const getTask2Res = await authFetch(`${BASE_URL}/tasks/${task2.id}`);
  const task2Details = await getTask2Res.json();
  await assert(
    'Task details includes depends_on and dependent_tasks',
    task2Details.depends_on?.some((d: { id: string }) => d.id === task1.id) &&
      task2Details.dependent_tasks?.some((d: { id: string }) => d.id === task3.id)
  );

  // 14. Remove dependency
  const removeDepRes = await authFetch(
    `${BASE_URL}/tasks/${task3.id}/dependencies/${task2.id}`,
    {
      method: 'DELETE',
    }
  );
  await assert('Dependency removed successfully', removeDepRes.status === 200);

  // 15. Task deletion
  const deleteSubtaskRes = await authFetch(`${BASE_URL}/tasks/${subtask.id}`, {
    method: 'DELETE',
  });
  await assert('Task deleted successfully', deleteSubtaskRes.status === 200);

  // Clean up test projects
  await authFetch(`${BASE_URL}/projects/${projA.id}`, { method: 'DELETE' });
  await authFetch(`${BASE_URL}/projects/${projB.id}`, { method: 'DELETE' });
  console.log('--- Verification Complete ---');

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.error(`FAILED: ${failed.length} / ${results.length} tests failed.`);
    process.exit(1);
  } else {
    console.log(`ALL ${results.length} VERIFICATION CHECKS PASSED.`);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
