/**
 * Comprehensive Automated Verification Script for Orkestr Tasks & Dependencies
 * Tests points 1 through 12, validating all constraints, edge cases, cycles, and CRUD.
 */

const BASE_URL = 'http://localhost:5001/api';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

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
  await assert('Health endpoint returns 200 and db connected', healthRes.status === 200 && health.services.database === 'connected');

  // 2. Existing project CRUD check & preserve data
  const projectsRes = await fetch(`${BASE_URL}/projects`);
  const initialProjects = await projectsRes.json();
  await assert('Existing projects preserved', Array.isArray(initialProjects) && initialProjects.length > 0);

  // Create Project A
  const createProjARes = await fetch(`${BASE_URL}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Verification Project A', description: 'Testing Task Flow' }),
  });
  const projA = await createProjARes.json();
  await assert('Project A created successfully', createProjARes.status === 201 && !!projA.id);

  // Create Project B (for cross-project dependency testing)
  const createProjBRes = await fetch(`${BASE_URL}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Verification Project B', description: 'Testing Cross Project' }),
  });
  const projB = await createProjBRes.json();
  await assert('Project B created successfully', createProjBRes.status === 201 && !!projB.id);

  // 3. Task creation in Project A
  const createTask1Res = await fetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Database Schema Setup',
      description: 'Setup tables and indexes',
      status: 'TODO',
      priority: 'HIGH',
      estimatedHours: 4.5,
    }),
  });
  const task1 = await createTask1Res.json();
  await assert('Task 1 created in Project A', createTask1Res.status === 201 && task1.title === 'Database Schema Setup');

  const createTask2Res = await fetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Backend API Implementation',
      description: 'REST routes for tasks',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      estimatedHours: 6,
    }),
  });
  const task2 = await createTask2Res.json();
  await assert('Task 2 created in Project A', createTask2Res.status === 201 && task2.title === 'Backend API Implementation');

  const createTask3Res = await fetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Frontend UI Integration',
      description: 'React components',
      status: 'TODO',
      priority: 'LOW',
      estimatedHours: 3,
    }),
  });
  const task3 = await createTask3Res.json();
  await assert('Task 3 created in Project A', createTask3Res.status === 201 && task3.title === 'Frontend UI Integration');

  // Task in Project B
  const createTaskBRes = await fetch(`${BASE_URL}/projects/${projB.id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Project B Task',
      status: 'TODO',
    }),
  });
  const taskB = await createTaskBRes.json();
  await assert('Task in Project B created', createTaskBRes.status === 201 && !!taskB.id);

  // 4. Task listing and filters
  const listTasksRes = await fetch(`${BASE_URL}/projects/${projA.id}/tasks`);
  const allTasksProjA = await listTasksRes.json();
  await assert('List tasks in Project A returns 3 tasks', Array.isArray(allTasksProjA) && allTasksProjA.length === 3);

  const filterStatusRes = await fetch(`${BASE_URL}/projects/${projA.id}/tasks?status=IN_PROGRESS`);
  const inProgressTasks = await filterStatusRes.json();
  await assert('Status filter works', inProgressTasks.length === 1 && inProgressTasks[0].status === 'IN_PROGRESS');

  const filterPriorityRes = await fetch(`${BASE_URL}/projects/${projA.id}/tasks?priority=HIGH`);
  const highPriorityTasks = await filterPriorityRes.json();
  await assert('Priority filter works', highPriorityTasks.length === 1 && highPriorityTasks[0].priority === 'HIGH');

  // 5. Task updates
  const updateTaskRes = await fetch(`${BASE_URL}/tasks/${task1.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'DONE', estimatedHours: 5 }),
  });
  const updatedTask1 = await updateTaskRes.json();
  await assert('Task update succeeds', updateTaskRes.status === 200 && updatedTask1.status === 'DONE' && updatedTask1.estimated_hours === 5);

  // 6. Subtask & Parent Task relationships
  const createSubtaskRes = await fetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Subtask of Task 2',
      parentTaskId: task2.id,
      status: 'TODO',
    }),
  });
  const subtask = await createSubtaskRes.json();
  await assert('Subtask created with parent_task_id', createSubtaskRes.status === 201 && subtask.parent_task_id === task2.id);

  // 7. Invalid inputs rejected
  const emptyTitleRes = await fetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '   ' }),
  });
  await assert('Empty title rejected with 400', emptyTitleRes.status === 400);

  const negativeHoursRes = await fetch(`${BASE_URL}/projects/${projA.id}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Invalid Task', estimatedHours: -2 }),
  });
  await assert('Negative estimated hours rejected with 400', negativeHoursRes.status === 400);

  // 8. Missing project and task 404s
  const missingProjTasksRes = await fetch(`${BASE_URL}/projects/00000000-0000-0000-0000-000000000000/tasks`);
  await assert('Missing project returns 404', missingProjTasksRes.status === 404);

  const missingTaskRes = await fetch(`${BASE_URL}/tasks/00000000-0000-0000-0000-000000000000`);
  await assert('Missing task returns 404', missingTaskRes.status === 404);

  // 9. Cross-project dependencies rejected
  const crossDepRes = await fetch(`${BASE_URL}/tasks/${task1.id}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dependsOnTaskId: taskB.id }),
  });
  await assert('Cross-project dependency rejected with 400', crossDepRes.status === 400);

  // 10. Self-dependency rejected
  const selfDepRes = await fetch(`${BASE_URL}/tasks/${task1.id}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dependsOnTaskId: task1.id }),
  });
  await assert('Self-dependency rejected with 400', selfDepRes.status === 400);

  // 11. Valid dependencies can be added
  // task2 depends on task1
  const addDep1Res = await fetch(`${BASE_URL}/tasks/${task2.id}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dependsOnTaskId: task1.id }),
  });
  await assert('Valid dependency (task2 depends on task1) added', addDep1Res.status === 201);

  // Duplicate dependency rejected
  const dupDepRes = await fetch(`${BASE_URL}/tasks/${task2.id}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dependsOnTaskId: task1.id }),
  });
  await assert('Duplicate dependency rejected with 409', dupDepRes.status === 409);

  // task3 depends on task2 (Chain: task1 -> task2 -> task3)
  const addDep2Res = await fetch(`${BASE_URL}/tasks/${task3.id}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dependsOnTaskId: task2.id }),
  });
  await assert('Chained dependency (task3 depends on task2) added', addDep2Res.status === 201);

  // 12. Dependency cycle rejected: task1 depends on task3!
  const cycleDepRes = await fetch(`${BASE_URL}/tasks/${task1.id}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dependsOnTaskId: task3.id }),
  });
  await assert('Circular dependency (task1 depends on task3) rejected with 400', cycleDepRes.status === 400);

  // 13. Retrieve task with dependency information
  const getTask2Res = await fetch(`${BASE_URL}/tasks/${task2.id}`);
  const task2Details = await getTask2Res.json();
  await assert(
    'Task details includes depends_on and dependent_tasks',
    task2Details.depends_on.some((d: { id: string }) => d.id === task1.id) &&
    task2Details.dependent_tasks.some((d: { id: string }) => d.id === task3.id)
  );

  // 14. Remove dependency
  const removeDepRes = await fetch(`${BASE_URL}/tasks/${task3.id}/dependencies/${task2.id}`, {
    method: 'DELETE',
  });
  await assert('Dependency removed successfully', removeDepRes.status === 200);

  // 15. Task deletion and cascade
  const deleteSubtaskRes = await fetch(`${BASE_URL}/tasks/${subtask.id}`, {
    method: 'DELETE',
  });
  await assert('Task deleted successfully', deleteSubtaskRes.status === 200);

  // Clean up test projects
  await fetch(`${BASE_URL}/projects/${projA.id}`, { method: 'DELETE' });
  await fetch(`${BASE_URL}/projects/${projB.id}`, { method: 'DELETE' });
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
