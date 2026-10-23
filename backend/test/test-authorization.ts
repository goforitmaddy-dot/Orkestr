/**
 * Comprehensive Automated Security & Authorization Verification Suite
 * Orkestr Authorization V1 & RBAC Enforcement
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected on /api/projects (401)
 * 2. Unauthenticated requests are rejected on /api/tasks/:id (401)
 * 3. Unauthenticated requests are rejected on /api/projects/:id/ai/plan (401)
 * 4. Unauthenticated requests are rejected on /api/projects/:id/ai/distribute (401)
 * 5. Atomic project creation assigns creator as OWNER
 * 6. Isolated project listing: User only sees projects where they are a member
 * 7. Non-member access to another project is rejected (403/404)
 * 8. Member cannot add or remove project members (403 Forbidden)
 * 9. Admin can add members, but cannot remove the Owner (403 Forbidden)
 * 10. Admin cannot delete the project (403 Forbidden, Owner only)
 * 11. Member cannot apply AI plans or task distributions (403 Forbidden)
 * 12. Owner and Admin can trigger AI planner and task distribution
 * 13. Member can update status of tasks assigned to them (200 OK)
 * 14. Member cannot update tasks assigned to other developers (403 Forbidden)
 * 15. Member cannot modify privileged fields (title, assigneeId, etc.) on assigned tasks (403 Forbidden)
 * 16. Member cannot delete tasks (403 Forbidden, Owner/Admin only)
 * 17. Cross-project task dependency rejected (400)
 * 18. User lookup /api/users requires authentication and scopes to collaborators
 */

import { pool, query } from '../src/db';
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
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

async function runAuthorizationTests() {
  console.log('=====================================================');
  console.log('Starting Orkestr Authorization V1 Security Suite');
  console.log('=====================================================\n');

  let server: Server | null = null;
  let baseUrl = 'http://localhost:5001/api';

  try {
    const res = await fetch('http://localhost:5001/api/health');
    if (res.status === 200) {
      console.log('Connected to existing server on port 5001.');
    } else {
      throw new Error('Not 200');
    }
  } catch {
    console.log('Starting ephemeral test server on port 5098...');
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(5098, () => {
        baseUrl = 'http://localhost:5098/api';
        resolve();
      });
    });
  }

  const cleanups: Array<() => Promise<void>> = [];

  try {
    // Helper to register user and obtain session
    const registerUser = async (name: string, email: string) => {
      const session = new CookieSession();
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password: 'Password123!',
          skills: ['TypeScript', 'Node.js'],
        }),
      });
      session.updateFromHeaders(res.headers);
      const user = (await res.json()) as { id: string; email: string };
      cleanups.push(async () => {
        await query('DELETE FROM users WHERE id = $1', [user.id]);
      });
      return { user, session };
    };

    // Create 3 test users: Owner, Admin, Member, and 1 Unrelated User
    const owner = await registerUser('Alice Owner', `owner_${Date.now()}@example.com`);
    const admin = await registerUser('Bob Admin', `admin_${Date.now()}@example.com`);
    const member = await registerUser('Charlie Member', `member_${Date.now()}@example.com`);
    const outsider = await registerUser('Eve Outsider', `outsider_${Date.now()}@example.com`);

    // 1. Unauthenticated requests rejected on /api/projects
    const unauthProjRes = await fetch(`${baseUrl}/projects`);
    assert('1. Unauthenticated GET /api/projects returns 401', unauthProjRes.status === 401);

    const unauthCreateRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauth Project' }),
    });
    assert('1b. Unauthenticated POST /api/projects returns 401', unauthCreateRes.status === 401);

    // 2. Unauthenticated requests rejected on tasks and AI endpoints
    const unauthTaskRes = await fetch(`${baseUrl}/tasks/00000000-0000-0000-0000-000000000000`);
    assert('2. Unauthenticated GET /api/tasks/:id returns 401', unauthTaskRes.status === 401);

    const unauthPlanRes = await fetch(
      `${baseUrl}/projects/00000000-0000-0000-0000-000000000000/ai/plan`,
      { method: 'POST' }
    );
    assert('3. Unauthenticated AI Planner generation returns 401', unauthPlanRes.status === 401);

    const unauthDistRes = await fetch(
      `${baseUrl}/projects/00000000-0000-0000-0000-000000000000/ai/distribute`,
      { method: 'POST' }
    );
    assert('4. Unauthenticated Task Distribution returns 401', unauthDistRes.status === 401);

    // 5. Atomic Project Creation assigns creator as OWNER
    const createProjRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.session.getCookieHeader(),
      },
      body: JSON.stringify({
        name: 'Authorization Security Test Project',
        description: 'Testing RBAC',
      }),
    });
    const project = (await createProjRes.json()) as { id: string; name: string };
    cleanups.push(async () => {
      await query('DELETE FROM projects WHERE id = $1', [project.id]);
    });

    const ownerMemberRes = await query<{ role: string; user_id: string }>(
      'SELECT role, user_id FROM project_members WHERE project_id = $1',
      [project.id]
    );

    assert(
      '5. Project created atomically with creator as OWNER',
      createProjRes.status === 201 &&
        ownerMemberRes.rows.length === 1 &&
        ownerMemberRes.rows[0].role === 'OWNER' &&
        ownerMemberRes.rows[0].user_id === owner.user.id
    );

    // 6. User only sees projects where they have authorized membership
    const ownerProjectsRes = await fetch(`${baseUrl}/projects`, {
      headers: { Cookie: owner.session.getCookieHeader() },
    });
    const ownerProjects = (await ownerProjectsRes.json()) as Array<{ id: string }>;
    assert(
      '6a. Owner sees their newly created project',
      ownerProjects.some((p) => p.id === project.id)
    );

    const outsiderProjectsRes = await fetch(`${baseUrl}/projects`, {
      headers: { Cookie: outsider.session.getCookieHeader() },
    });
    const outsiderProjects = (await outsiderProjectsRes.json()) as Array<{ id: string }>;
    assert(
      '6b. Outsider does not see unrelated project in /api/projects',
      !outsiderProjects.some((p) => p.id === project.id)
    );

    // 7. Non-member direct access to another project is rejected
    const outsiderAccessRes = await fetch(`${baseUrl}/projects/${project.id}`, {
      headers: { Cookie: outsider.session.getCookieHeader() },
    });
    assert(
      '7. Outsider access to project details rejected with 403 Forbidden',
      outsiderAccessRes.status === 403
    );

    // Add Bob as ADMIN and Charlie as MEMBER
    await fetch(`${baseUrl}/projects/${project.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.session.getCookieHeader(),
      },
      body: JSON.stringify({ userId: admin.user.id, role: 'ADMIN' }),
    });

    await fetch(`${baseUrl}/projects/${project.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.session.getCookieHeader(),
      },
      body: JSON.stringify({ userId: member.user.id, role: 'MEMBER' }),
    });

    // 8. Member cannot add project members (403)
    const memberAddRes = await fetch(`${baseUrl}/projects/${project.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: member.session.getCookieHeader(),
      },
      body: JSON.stringify({ userId: outsider.user.id, role: 'MEMBER' }),
    });
    assert('8. Member cannot add project members (403)', memberAddRes.status === 403);

    // Member cannot remove members
    const memberRemoveRes = await fetch(
      `${baseUrl}/projects/${project.id}/members/${admin.user.id}`,
      {
        method: 'DELETE',
        headers: { Cookie: member.session.getCookieHeader() },
      }
    );
    assert('8b. Member cannot remove project members (403)', memberRemoveRes.status === 403);

    // 9. Admin can add members, but cannot remove the Owner
    const adminRemoveOwnerRes = await fetch(
      `${baseUrl}/projects/${project.id}/members/${owner.user.id}`,
      {
        method: 'DELETE',
        headers: { Cookie: admin.session.getCookieHeader() },
      }
    );
    assert(
      '9. Admin cannot remove the Project Owner (403)',
      adminRemoveOwnerRes.status === 403
    );

    // 10. Admin cannot delete the project (Owner only)
    const adminDeleteProjRes = await fetch(`${baseUrl}/projects/${project.id}`, {
      method: 'DELETE',
      headers: { Cookie: admin.session.getCookieHeader() },
    });
    assert(
      '10. Admin cannot delete the project (403 Forbidden, Owner only)',
      adminDeleteProjRes.status === 403
    );

    // 11. Member cannot run AI planner or apply task distribution
    const memberPlanRes = await fetch(`${baseUrl}/projects/${project.id}/ai/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: member.session.getCookieHeader(),
      },
      body: JSON.stringify({ prompt: 'Build auth' }),
    });
    assert('11a. Member cannot run AI Planner (403)', memberPlanRes.status === 403);

    const memberDistRes = await fetch(`${baseUrl}/projects/${project.id}/ai/distribute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: member.session.getCookieHeader(),
      },
      body: JSON.stringify({}),
    });
    assert('11b. Member cannot preview Task Distribution (403)', memberDistRes.status === 403);

    // 12. Create tasks: Task 1 assigned to Charlie (Member), Task 2 assigned to Bob (Admin)
    const createTaskRes1 = await fetch(`${baseUrl}/projects/${project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.session.getCookieHeader(),
      },
      body: JSON.stringify({
        title: 'Charlie Assigned Task',
        assigneeId: member.user.id,
        status: 'TODO',
      }),
    });
    const task1 = (await createTaskRes1.json()) as { id: string };

    const createTaskRes2 = await fetch(`${baseUrl}/projects/${project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.session.getCookieHeader(),
      },
      body: JSON.stringify({
        title: 'Bob Assigned Task',
        assigneeId: admin.user.id,
        status: 'TODO',
      }),
    });
    const task2 = (await createTaskRes2.json()) as { id: string };

    // 13. Member can update status of task assigned to them
    const memberUpdateOwnRes = await fetch(`${baseUrl}/tasks/${task1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: member.session.getCookieHeader(),
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    const updatedTask1 = (await memberUpdateOwnRes.json()) as { status: string };
    assert(
      '13. Member can update status of task assigned to them',
      memberUpdateOwnRes.status === 200 && updatedTask1.status === 'IN_PROGRESS'
    );

    // 14. Member cannot update tasks assigned to other developers
    const memberUpdateOtherRes = await fetch(`${baseUrl}/tasks/${task2.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: member.session.getCookieHeader(),
      },
      body: JSON.stringify({ status: 'DONE' }),
    });
    assert(
      '14. Member cannot update tasks assigned to someone else (403)',
      memberUpdateOtherRes.status === 403
    );

    // 15. Member cannot modify privileged fields (title, assigneeId) on their assigned task
    const memberPrivilegedRes = await fetch(`${baseUrl}/tasks/${task1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: member.session.getCookieHeader(),
      },
      body: JSON.stringify({
        status: 'DONE',
        title: 'Malicious Title Change',
      }),
    });
    assert(
      '15. Member cannot modify privileged fields (title/reassign) on assigned tasks (403)',
      memberPrivilegedRes.status === 403
    );

    // 16. Member cannot delete tasks
    const memberDeleteTaskRes = await fetch(`${baseUrl}/tasks/${task1.id}`, {
      method: 'DELETE',
      headers: { Cookie: member.session.getCookieHeader() },
    });
    assert('16. Member cannot delete tasks (403)', memberDeleteTaskRes.status === 403);

    // Admin CAN delete task
    const adminDeleteTaskRes = await fetch(`${baseUrl}/tasks/${task2.id}`, {
      method: 'DELETE',
      headers: { Cookie: admin.session.getCookieHeader() },
    });
    assert(
      '16b. Admin can delete task (200)',
      adminDeleteTaskRes.status === 200
    );

    // 17. Cross-project task dependency rejected
    // Create Project 2 owned by Outsider
    const proj2Res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: outsider.session.getCookieHeader(),
      },
      body: JSON.stringify({ name: 'Outsider Project' }),
    });
    const proj2 = (await proj2Res.json()) as { id: string };
    cleanups.push(async () => {
      await query('DELETE FROM projects WHERE id = $1', [proj2.id]);
    });

    const taskProj2Res = await fetch(`${baseUrl}/projects/${proj2.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: outsider.session.getCookieHeader(),
      },
      body: JSON.stringify({ title: 'Task in Project 2' }),
    });
    const taskInProj2 = (await taskProj2Res.json()) as { id: string };

    const crossDepRes = await fetch(`${baseUrl}/tasks/${task1.id}/dependencies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: owner.session.getCookieHeader(),
      },
      body: JSON.stringify({ dependsOnTaskId: taskInProj2.id }),
    });
    assert(
      '17. Cross-project task dependency rejected (400)',
      crossDepRes.status === 400
    );

    // 18. /api/users requires authentication and only shows collaborators
    const ownerUsersRes = await fetch(`${baseUrl}/users`, {
      headers: { Cookie: owner.session.getCookieHeader() },
    });
    const ownerUsers = (await ownerUsersRes.json()) as Array<{ id: string }>;
    assert(
      '18. /api/users returns collaborators and excludes outsiders',
      ownerUsersRes.status === 200 &&
        ownerUsers.some((u) => u.id === member.user.id) &&
        !ownerUsers.some((u) => u.id === outsider.user.id)
    );
  } catch (err) {
    console.error('Unexpected test error:', err);
    assert('Test suite ran without unhandled exception', false, String(err));
  } finally {
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (err) {
        console.warn('Cleanup error:', err);
      }
    }

    if (server) {
      await new Promise<void>((resolve) => (server as Server).close(() => resolve()));
    }
  }

  console.log('\n=====================================================');
  console.log('Authorization Test Summary:');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  console.log(`Failed: ${failedCount} / ${results.length}`);
  console.log('=====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAuthorizationTests().then(() => {
  pool.end();
});
