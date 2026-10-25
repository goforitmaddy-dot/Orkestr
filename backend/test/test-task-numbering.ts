/**
 * Automated Test Suite: Task Numbering and Key Stability (ORK-<task_number>)
 *
 * Verifies:
 * 1. Task creation generates a positive, unique task_number from sequence.
 * 2. Concurrent task creation generates collision-free, unique task numbers.
 * 3. Editing/updating a task (title, description, status, priority, etc.) preserves the exact same task_number.
 * 4. updateTask returns task_number in its payload.
 * 5. GET /api/projects/:id/tasks returns task_number for all tasks.
 * 6. GET /api/tasks/:id returns task_number and dependencies.
 * 7. GET /api/me/tasks returns task_number for assigned/all tasks.
 * 8. Editing a task via PATCH /api/tasks/:id returns task_number in the response.
 */

import { query } from '../src/db';
import { createApp } from '../src/app';
import { Server } from 'http';
import * as taskService from '../src/services/task.service';

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

class CookieSession {
  private cookies: Map<string, string> = new Map();

  updateFromHeaders(headers: Headers) {
    const rawSetCookie = headers.get('set-cookie');
    if (rawSetCookie) {
      const cookieParts = rawSetCookie.split(/,(?=[a-zA-Z0-9_-]+=)/);
      for (const part of cookieParts) {
        const [cookiePair] = part.split(';');
        const [name, ...valParts] = cookiePair.trim().split('=');
        if (name) {
          const val = valParts.join('=');
          if (val === '' || part.includes('Expires=Thu, 01 Jan 1970')) {
            this.cookies.delete(name);
          } else {
            this.cookies.set(name, val);
          }
        }
      }
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

async function run() {
  console.log('=====================================================');
  console.log('Running Task Numbering & Key Stability Test Suite');
  console.log('=====================================================\n');

  const app = createApp();
  let server: Server;
  const port = 49200 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://localhost:${port}`;

  await new Promise<void>((resolve) => {
    server = app.listen(port, () => resolve());
  });

  const timestamp = Date.now();
  let testUserId = '';
  let testProjectId = '';

  try {
    // Setup test user & project
    const userRes = await query<{ id: string }>(
      `INSERT INTO users (name, username, email, password_hash)
       VALUES ('Task Key Tester', 'taskkeytester_${timestamp}', 'taskkey_${timestamp}@example.com', 'hashed_pw')
       RETURNING id`
    );
    testUserId = userRes.rows[0].id;

    const projectRes = await query<{ id: string }>(
      `INSERT INTO projects (name, description)
       VALUES ('Task Numbering Test Project', 'Testing ORK-XX keys')
       RETURNING id`
    );
    testProjectId = projectRes.rows[0].id;

    await query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [testProjectId, testUserId]
    );

    // Login session
    const session = new CookieSession();
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `taskkey_${timestamp}@example.com`,
        password: 'password123', // Will fail auth so we test session mock or direct login
      }),
    });
    // Direct session or API test
    // To ensure session is authenticated, update password_hash to bcrypt or insert session directly
    const bcrypt = await import('bcryptjs');
    const realHash = await bcrypt.hash('CorrectPass123!', 10);
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [realHash, testUserId]);

    const realLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `taskkey_${timestamp}@example.com`,
        password: 'CorrectPass123!',
      }),
    });
    session.updateFromHeaders(realLoginRes.headers);
    assert('1. Test user logged in successfully', realLoginRes.status === 200);

    // 1. Service Level: Task creation creates task_number
    const createdTask1 = await taskService.createTask({
      projectId: testProjectId,
      title: 'First Sequenced Task',
      description: 'Testing task_number allocation',
      priority: 'HIGH',
    });
    assert('2a. createTask generates a valid positive task_number', typeof createdTask1.task_number === 'number' && createdTask1.task_number > 0);

    const createdTask2 = await taskService.createTask({
      projectId: testProjectId,
      title: 'Second Sequenced Task',
    });
    assert('2b. Sequential task creation increments task_number', createdTask2.task_number > createdTask1.task_number);

    // 2. Concurrency Safety: Creating 5 tasks concurrently produces 5 unique task_numbers
    const concurrentCreations = await Promise.all([
      taskService.createTask({ projectId: testProjectId, title: 'Concurrent 1' }),
      taskService.createTask({ projectId: testProjectId, title: 'Concurrent 2' }),
      taskService.createTask({ projectId: testProjectId, title: 'Concurrent 3' }),
      taskService.createTask({ projectId: testProjectId, title: 'Concurrent 4' }),
      taskService.createTask({ projectId: testProjectId, title: 'Concurrent 5' }),
    ]);
    const concurrentNumbers = concurrentCreations.map((t) => t.task_number);
    const uniqueNumbers = new Set(concurrentNumbers);
    assert(
      '3. Concurrent task creations produce distinct, collision-free task numbers',
      uniqueNumbers.size === 5 && !uniqueNumbers.has(createdTask1.task_number) && !uniqueNumbers.has(createdTask2.task_number)
    );

    // 3. updateTask preserves task_number and returns it in result
    const initialNum = createdTask1.task_number;
    const updatedTask1 = await taskService.updateTask(createdTask1.id, {
      title: 'Updated First Sequenced Task Title',
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      estimatedHours: 8,
    });
    assert('4a. updateTask returns task_number', typeof updatedTask1?.task_number === 'number');
    assert('4b. updateTask preserves the exact same task_number after update', updatedTask1?.task_number === initialNum);
    assert('4c. updateTask updated title and priority correctly', updatedTask1?.title === 'Updated First Sequenced Task Title' && updatedTask1?.priority === 'URGENT');

    // 4. API Level: POST /api/projects/:id/tasks returns task_number
    const apiCreateRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: session.getCookieHeader(),
      },
      body: JSON.stringify({
        title: 'Task Created via HTTP API',
        priority: 'MEDIUM',
      }),
    });
    const apiCreateJson = await apiCreateRes.json();
    assert(
      '5. HTTP POST /api/projects/:id/tasks returns task_number in response payload',
      apiCreateRes.status === 201 && typeof apiCreateJson.task_number === 'number' && apiCreateJson.task_number > 0
    );
    const apiCreatedTaskId = apiCreateJson.id;
    const apiCreatedTaskNum = apiCreateJson.task_number;

    // 5. API Level: PATCH /api/tasks/:id preserves task_number and returns it
    const apiPatchRes = await fetch(`${baseUrl}/api/tasks/${apiCreatedTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: session.getCookieHeader(),
      },
      body: JSON.stringify({
        title: 'Task Created via HTTP API (Renamed)',
        status: 'IN_PROGRESS',
      }),
    });
    const apiPatchJson = await apiPatchRes.json();
    assert(
      '6. HTTP PATCH /api/tasks/:id returns task_number and preserves stability',
      apiPatchRes.status === 200 && apiPatchJson.task_number === apiCreatedTaskNum && apiPatchJson.status === 'IN_PROGRESS'
    );

    // 6. API Level: GET /api/projects/:id/tasks returns task_number on all tasks
    const apiListRes = await fetch(`${baseUrl}/api/projects/${testProjectId}/tasks`, {
      method: 'GET',
      headers: {
        cookie: session.getCookieHeader(),
      },
    });
    const apiListJson = await apiListRes.json();
    const allHaveTaskNumber = Array.isArray(apiListJson) && apiListJson.length > 0 && apiListJson.every((t: any) => typeof t.task_number === 'number' && t.task_number > 0);
    assert('7. HTTP GET /api/projects/:id/tasks includes task_number on all tasks', apiListRes.status === 200 && allHaveTaskNumber);

    // 7. API Level: GET /api/tasks/:id returns task_number
    const apiGetRes = await fetch(`${baseUrl}/api/tasks/${apiCreatedTaskId}`, {
      method: 'GET',
      headers: {
        cookie: session.getCookieHeader(),
      },
    });
    const apiGetJson = await apiGetRes.json();
    assert(
      '8. HTTP GET /api/tasks/:id includes task_number in response',
      apiGetRes.status === 200 && apiGetJson.task_number === apiCreatedTaskNum
    );

    // 8. API Level: GET /api/me/tasks returns task_number
    // Assign created task to test user
    await query(`UPDATE tasks SET assignee_id = $1 WHERE id = $2`, [testUserId, apiCreatedTaskId]);
    const apiMeRes = await fetch(`${baseUrl}/api/me/tasks?scope=assigned`, {
      method: 'GET',
      headers: {
        cookie: session.getCookieHeader(),
      },
    });
    const apiMeJson = await apiMeRes.json();
    const meTask = Array.isArray(apiMeJson) ? apiMeJson.find((t: any) => t.id === apiCreatedTaskId) : null;
    assert(
      '9. HTTP GET /api/me/tasks includes task_number in personal task payload',
      apiMeRes.status === 200 && meTask && meTask.task_number === apiCreatedTaskNum
    );

  } finally {
    // Cleanup
    if (testProjectId) {
      await query(`DELETE FROM tasks WHERE project_id = $1`, [testProjectId]);
      await query(`DELETE FROM project_members WHERE project_id = $1`, [testProjectId]);
      await query(`DELETE FROM projects WHERE id = $1`, [testProjectId]);
    }
    if (testUserId) {
      await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n=====================================================');
  console.log('Task Numbering & Key Stability Test Summary:');
  console.log(`Passed: ${passed} / ${results.length}`);
  console.log(`Failed: ${failed} / ${results.length}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error running task numbering test:', err);
  process.exit(1);
});
