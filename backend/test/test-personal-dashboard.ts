/**
 * Automated Security & Data Correctness Test Suite: Personal Developer Dashboard V1
 *
 * Verifies:
 * 1. Unauthenticated GET /api/me/tasks receives 401 Unauthorized
 * 2. Empty task list returns 200 with []
 * 3. Endpoint returns only tasks assigned to the authenticated user
 * 4. Supplying another user's ID (?userId=... or body) cannot reveal their tasks
 * 5. Tasks from unauthorized projects are never returned
 * 6. Dependencies and their completion status are scoped to returned tasks
 * 7. is_blocked is true when prerequisites are unfinished and false when all prerequisites are DONE
 * 8. Status updates work for tasks assigned to the user
 * 9. Privileged fields (title, assigneeId, etc.) cannot be modified by a member
 * 10. GET /api/projects returns user's authorized projects with project role
 */

import { query } from '../src/db';
import { createApp } from '../src/app';
import { Server } from 'http';

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
    const pairs: string[] = [];
    for (const [name, val] of this.cookies.entries()) {
      pairs.push(`${name}=${val}`);
    }
    return pairs.join('; ');
  }
}

interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  text: string;
}

async function request<T = unknown>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    session?: CookieSession;
  } = {}
): Promise<ApiResponse<T>> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.session) {
    const cookie = options.session.getCookieHeader();
    if (cookie) {
      headers['Cookie'] = cookie;
    }
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (options.session) {
    options.session.updateFromHeaders(res.headers);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // raw text
  }

  return { status: res.status, headers: res.headers, body: json as T, text };
}

async function runDashboardTests() {
  console.log('\n=====================================================');
  console.log('Starting Personal Developer Dashboard V1 Test Suite');
  console.log('=====================================================\n');

  let server: Server | null = null;
  let baseUrl = 'http://localhost:5001';

  try {
    const probe = await fetch(`${baseUrl}/api/health`).catch(() => null);
    if (!probe || !probe.ok) {
      console.log('Spawning test server instance on port 5002...');
      const app = createApp();
      server = app.listen(5002);
      baseUrl = 'http://localhost:5002';
      await new Promise((resolve) => setTimeout(resolve, 500));
    } else {
      console.log('Connected to existing server on port 5001.');
    }

    const testRunId = Date.now();
    const aliceEmail = `alice_dash_${testRunId}@example.com`;
    const bobEmail = `bob_dash_${testRunId}@example.com`;
    const password = 'Password123!';

    const aliceSession = new CookieSession();
    const bobSession = new CookieSession();

    // 1. Unauthenticated GET /api/me/tasks receives 401
    const unauthRes = await request(baseUrl, '/api/me/tasks');
    assert('1. Unauthenticated GET /api/me/tasks returns 401', unauthRes.status === 401);

    // 2. Register Alice and Bob
    const regAlice = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Alice Developer', email: aliceEmail, password },
      session: aliceSession,
    });
    assert('2a. Alice registers successfully', regAlice.status === 201);
    const aliceId = regAlice.body?.id;

    const regBob = await request(baseUrl, '/api/auth/register', {
      method: 'POST',
      body: { name: 'Bob Developer', email: bobEmail, password },
      session: bobSession,
    });
    assert('2b. Bob registers successfully', regBob.status === 201);
    const bobId = regBob.body?.id;

    // 3. Empty task list returns 200 with []
    const emptyAliceRes = await request(baseUrl, '/api/me/tasks', { session: aliceSession });
    assert(
      '3. Alice has an empty task list initially (200 OK, [])',
      emptyAliceRes.status === 200 && Array.isArray(emptyAliceRes.body) && emptyAliceRes.body.length === 0
    );

    // 4. Alice creates Project Alpha (Alice is OWNER)
    const projAlphaRes = await request(baseUrl, '/api/projects', {
      method: 'POST',
      body: { name: 'Alpha Project', description: 'Dashboard Testing Space' },
      session: aliceSession,
    });
    assert('4. Project Alpha created by Alice', projAlphaRes.status === 201);
    const alphaId = projAlphaRes.body?.id;

    // 5. Alice adds Bob as MEMBER to Alpha Project
    const addBobRes = await request(baseUrl, `/api/projects/${alphaId}/members`, {
      method: 'POST',
      body: { userId: bobId, role: 'MEMBER' },
      session: aliceSession,
    });
    assert('5. Bob added as MEMBER to Alpha Project', addBobRes.status === 201);

    // 6. Alice creates Task 1 assigned to Alice (estimated 5 hours, priority HIGH)
    const task1Res = await request(baseUrl, `/api/projects/${alphaId}/tasks`, {
      method: 'POST',
      body: {
        title: 'Design API Gateway',
        description: 'Implement reverse proxy routing',
        priority: 'HIGH',
        estimatedHours: 5,
        assigneeId: aliceId,
      },
      session: aliceSession,
    });
    assert('6a. Task 1 assigned to Alice created', task1Res.status === 201);
    const task1Id = task1Res.body?.id;

    // 7. Alice creates Task 2 assigned to Bob (estimated 3 hours, priority URGENT)
    const task2Res = await request(baseUrl, `/api/projects/${alphaId}/tasks`, {
      method: 'POST',
      body: {
        title: 'Setup PostgreSQL migrations',
        description: 'Run base schema migrations',
        priority: 'URGENT',
        estimatedHours: 3,
        assigneeId: bobId,
      },
      session: aliceSession,
    });
    assert('6b. Task 2 assigned to Bob created', task2Res.status === 201);
    const task2Id = task2Res.body?.id;

    // 8. Alice creates Task 3 assigned to Alice (estimated 4 hours, priority MEDIUM), dependent on Task 2
    const task3Res = await request(baseUrl, `/api/projects/${alphaId}/tasks`, {
      method: 'POST',
      body: {
        title: 'Deploy backend cluster',
        description: 'Deploy API services to staging',
        priority: 'MEDIUM',
        estimatedHours: 4,
        assigneeId: aliceId,
      },
      session: aliceSession,
    });
    assert('6c. Task 3 assigned to Alice created', task3Res.status === 201);
    const task3Id = task3Res.body?.id;

    // Add dependency: Task 3 depends on Task 2
    const depRes = await request(baseUrl, `/api/tasks/${task3Id}/dependencies`, {
      method: 'POST',
      body: { dependsOnTaskId: task2Id },
      session: aliceSession,
    });
    assert('6d. Task 3 depends on Task 2 added', depRes.status === 201);

    interface TestTask {
      id: string;
      project_id: string;
      project_name: string;
      parent_task_id: string | null;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      estimated_hours: number | null;
      dependencies: Array<{ id: string; title: string; status: string; is_completed: boolean }>;
      is_blocked: boolean;
    }

    interface TestProject {
      id: string;
      name: string;
      role?: string;
    }

    // 9. Verify Alice's GET /api/me/tasks
    const aliceTasksRes = await request<TestTask[]>(baseUrl, '/api/me/tasks', { session: aliceSession });
    const aliceTasks = aliceTasksRes.body;
    assert('7a. Alice receives 200 OK on /api/me/tasks', aliceTasksRes.status === 200);
    assert(
      '7b. Alice receives exactly 2 assigned tasks (Task 1 & Task 3)',
      Array.isArray(aliceTasks) && aliceTasks.length === 2 &&
      aliceTasks.some((t) => t.id === task1Id) &&
      aliceTasks.some((t) => t.id === task3Id) &&
      !aliceTasks.some((t) => t.id === task2Id)
    );

    const task3FromAlice = aliceTasks.find((t) => t.id === task3Id);
    assert(
      '7c. Task 3 includes project name and ID',
      task3FromAlice?.project_id === alphaId && task3FromAlice?.project_name === 'Alpha Project'
    );
    assert(
      '7d. Task 3 dependency list includes Task 2 with is_completed: false',
      task3FromAlice?.dependencies?.length === 1 &&
      task3FromAlice?.dependencies[0]?.id === task2Id &&
      task3FromAlice?.dependencies[0]?.is_completed === false
    );
    assert(
      '7e. Task 3 is_blocked is true because Task 2 is unfinished',
      task3FromAlice?.is_blocked === true
    );

    const task1FromAlice = aliceTasks.find((t) => t.id === task1Id);
    assert(
      '7f. Task 1 has is_blocked: false because it has no dependencies',
      task1FromAlice?.is_blocked === false && task1FromAlice?.dependencies?.length === 0
    );

    // 10. Verify Bob's GET /api/me/tasks
    const bobTasksRes = await request<TestTask[]>(baseUrl, '/api/me/tasks', { session: bobSession });
    const bobTasks = bobTasksRes.body;
    assert(
      '8. Bob sees only Task 2 and does not see Task 1 or Task 3',
      bobTasksRes.status === 200 && Array.isArray(bobTasks) &&
      bobTasks.length === 1 && bobTasks[0]?.id === task2Id
    );

    // 11. ID Injection / Parameter Tampering: Query param or body cannot leak other user's tasks
    const tamperRes = await request<TestTask[]>(baseUrl, `/api/me/tasks?userId=${bobId}`, {
      method: 'GET',
      session: aliceSession,
    });
    assert(
      '9. Passing another user ID in query string does not leak their tasks',
      tamperRes.status === 200 &&
      Array.isArray(tamperRes.body) &&
      !tamperRes.body.some((t) => t.id === task2Id)
    );

    // 12. Unauthorized Project Isolation:
    // Alice creates Project Beta (Private, Bob is NOT a member)
    const projBetaRes = await request<{ id: string }>(baseUrl, '/api/projects', {
      method: 'POST',
      body: { name: 'Secret Beta Project', description: 'Confidential' },
      session: aliceSession,
    });
    const betaId = projBetaRes.body?.id;

    // Directly assign Bob to a task in Beta (simulating stale or cross-assigned row)
    const secretTaskRes = await query<{ id: string }>(
      `INSERT INTO tasks (project_id, title, status, priority, estimated_hours, assignee_id)
       VALUES ($1, 'Top Secret Research', 'TODO', 'HIGH', 10, $2)
       RETURNING id`,
      [betaId, bobId]
    );
    const secretTaskId = secretTaskRes.rows[0].id;

    // Bob calls /api/me/tasks: Must NOT include secret task because Bob is not a member of Project Beta!
    const bobTasksAgain = await request<TestTask[]>(baseUrl, '/api/me/tasks', { session: bobSession });
    assert(
      '10. Tasks from unauthorized projects are never returned on /api/me/tasks',
      !bobTasksAgain.body.some((t) => t.id === secretTaskId)
    );

    // 13. Controlled lifecycle: Bob (member) cannot mark his assigned task directly to DONE
    const bobBypassDone = await request(baseUrl, `/api/tasks/${task2Id}`, {
      method: 'PATCH',
      body: { status: 'DONE' },
      session: bobSession,
    });
    assert('11a. Member cannot arbitrarily mark task DONE (403 Forbidden)', bobBypassDone.status === 403);

    // Bob starts working on the task: TODO -> IN_PROGRESS
    const bobStartTask = await request(baseUrl, `/api/tasks/${task2Id}`, {
      method: 'PATCH',
      body: { status: 'IN_PROGRESS' },
      session: bobSession,
    });
    assert('11b. Bob starts working on his assigned task (TODO -> IN_PROGRESS)', bobStartTask.status === 200);

    // Task 2 is approved to DONE by Alice (Owner review / system)
    await query(`UPDATE tasks SET status = 'DONE', updated_at = NOW() WHERE id = $1`, [task2Id]);

    // Alice fetches her tasks again: Task 3's dependency Task 2 should now be completed, unblocking Task 3
    const aliceRefreshed = await request<TestTask[]>(baseUrl, '/api/me/tasks', { session: aliceSession });
    const refreshedTask3 = aliceRefreshed.body.find((t) => t.id === task3Id);
    assert(
      '11b. Task 3 is unblocked (is_blocked: false) once prerequisite Task 2 is DONE',
      refreshedTask3?.dependencies[0]?.is_completed === true && refreshedTask3?.is_blocked === false
    );

    // 14. Privileged fields rejected for members
    const bobAttemptReassign = await request(baseUrl, `/api/tasks/${task2Id}`, {
      method: 'PATCH',
      body: { title: 'Unauthorized Modification', priority: 'LOW' },
      session: bobSession,
    });
    assert(
      '12. Member cannot modify privileged fields (title, priority) on assigned task (403)',
      bobAttemptReassign.status === 403
    );

    // 15. GET /api/projects returns user's authorized projects with project role
    const aliceProjectsRes = await request<TestProject[]>(baseUrl, '/api/projects', { session: aliceSession });
    assert(
      '13a. Alice sees her projects with role OWNER',
      aliceProjectsRes.status === 200 &&
      aliceProjectsRes.body.some((p) => p.id === alphaId && p.role === 'OWNER') &&
      aliceProjectsRes.body.some((p) => p.id === betaId && p.role === 'OWNER')
    );

    const bobProjectsRes = await request<TestProject[]>(baseUrl, '/api/projects', { session: bobSession });
    assert(
      '13b. Bob sees Alpha Project with role MEMBER and does NOT see Secret Beta Project',
      bobProjectsRes.status === 200 &&
      bobProjectsRes.body.some((p) => p.id === alphaId && p.role === 'MEMBER') &&
      !bobProjectsRes.body.some((p) => p.id === betaId)
    );

    // Clean up test records
    await query('DELETE FROM projects WHERE id IN ($1, $2)', [alphaId, betaId]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [aliceId, bobId]);
  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n=====================================================');
  console.log('Personal Developer Dashboard Test Summary:');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  console.log(`Failed: ${results.length - passedCount} / ${results.length}`);
  console.log('=====================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runDashboardTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
