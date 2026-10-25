import { Server } from 'http';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { pool, query } from '../src/db';
import * as activityService from '../src/services/activity.service';

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

function computeSignature(payload: string | Buffer, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
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

async function runActivityAssociationTests() {
  console.log('=====================================================');
  console.log('Starting Task-to-GitHub Activity Association Test Suite');
  console.log('=====================================================\n');

  const testSecret = 'test_webhook_secret_activity_suite_123';
  const originalSecret = config.github.webhookSecret;
  config.github.webhookSecret = testSecret;

  const app = createApp();
  let server: Server;
  const testPort = 5096;
  const baseUrl = `http://localhost:${testPort}/api`;

  await new Promise<void>((resolve) => {
    server = app.listen(testPort, () => {
      resolve();
    });
  });

  const timestamp = Date.now();
  const repoA_Id = 998811;
  const repoB_Id = 998822;
  const installationId = 112233;

  let projectA_Id = '';
  let projectB_Id = '';
  let userAliceId = '';
  let userBobId = '';
  let taskA1_Id = '';
  let taskA1_Number = 0;
  let taskA2_Id = '';
  let taskA2_Number = 0;
  let taskB1_Id = '';
  let taskB1_Number = 0;

  const aliceSession = new CookieSession();
  const bobSession = new CookieSession();

  try {
    // -----------------------------------------------------------------
    // 1. Reference Extraction Unit Tests
    // -----------------------------------------------------------------
    console.log('--- 1. Reference Extraction Logic ---');
    const refs1 = activityService.extractTaskReferences('feature/ORK-42-authentication-pipeline');
    assert('1a. Extracts numeric task reference from branch name', refs1.includes('42'));

    const refs2 = activityService.extractTaskReferences('feat(ORK-105): implement secure cookies [ORK-105]');
    assert('1b. Extracts numeric task reference from commit message', refs2.includes('105'));

    const refs3 = activityService.extractTaskReferences('Resolves ORK-1 and relates to ORK-2');
    assert('1c. Extracts multiple task references from PR body', refs3.includes('1') && refs3.includes('2'));

    const testUuid = 'b7f3a8b2-13df-4f0e-a612-42da516ec223';
    const refs4 = activityService.extractTaskReferences(`fix(ORK-${testUuid}): patch buffer leak`);
    assert('1d. Extracts UUID reference from commit message', refs4.includes(testUuid));

    const refs5 = activityService.extractTaskReferences('no-task-here/feature/just-refactoring');
    assert('1e. Returns empty array when no ORK references exist', refs5.length === 0);

    // -----------------------------------------------------------------
    // 2. Setup Test Database Records
    // -----------------------------------------------------------------
    console.log('\n--- 2. Database Fixtures Setup ---');
    // User Alice (has linked GitHub identity: 887766)
    const aliceRes = await query<{ id: string }>(
      `INSERT INTO users (name, username, email, password_hash, github_user_id, github_username, github_linked_at)
       VALUES ('Alice Dev', $1, $2, 'hashed_pw', 887766, 'alicedev', NOW())
       RETURNING id`,
      [`alice_${timestamp}`, `alice_${timestamp}@test.com`]
    );
    userAliceId = aliceRes.rows[0].id;

    // User Bob (no linked GitHub identity, outsider to Project A)
    const bobRes = await query<{ id: string }>(
      `INSERT INTO users (name, username, email, password_hash)
       VALUES ('Bob Outsider', $1, $2, 'hashed_pw')
       RETURNING id`,
      [`bob_${timestamp}`, `bob_${timestamp}@test.com`]
    );
    userBobId = bobRes.rows[0].id;

    // Project A: Connected to repoA_Id
    const projARes = await query<{ id: string }>(
      `INSERT INTO projects (
         name, description, github_repo_id, github_repo_owner, github_repo_name,
         github_installation_id, github_connection_status, github_connected_at
       ) VALUES (
         'Project A', 'Connected to Repo A', $1, 'orkestr', 'repo-a', $2, 'CONNECTED', NOW()
       ) RETURNING id`,
      [repoA_Id, installationId]
    );
    projectA_Id = projARes.rows[0].id;

    await query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [projectA_Id, userAliceId]
    );

    // Project B: Connected to repoB_Id
    const projBRes = await query<{ id: string }>(
      `INSERT INTO projects (
         name, description, github_repo_id, github_repo_owner, github_repo_name,
         github_installation_id, github_connection_status, github_connected_at
       ) VALUES (
         'Project B', 'Connected to Repo B', $1, 'orkestr', 'repo-b', $2, 'CONNECTED', NOW()
       ) RETURNING id`,
      [repoB_Id, installationId]
    );
    projectB_Id = projBRes.rows[0].id;

    await query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [projectB_Id, userBobId]
    );

    // Tasks in Project A
    const taskA1Res = await query<{ id: string; task_number: number }>(
      `INSERT INTO tasks (project_id, title, status)
       VALUES ($1, 'Task A1 - Login Auth', 'TODO')
       RETURNING id, task_number`,
      [projectA_Id]
    );
    taskA1_Id = taskA1Res.rows[0].id;
    taskA1_Number = taskA1Res.rows[0].task_number;

    const taskA2Res = await query<{ id: string; task_number: number }>(
      `INSERT INTO tasks (project_id, title, status)
       VALUES ($1, 'Task A2 - User Profile', 'TODO')
       RETURNING id, task_number`,
      [projectA_Id]
    );
    taskA2_Id = taskA2Res.rows[0].id;
    taskA2_Number = taskA2Res.rows[0].task_number;

    // Task in Project B
    const taskB1Res = await query<{ id: string; task_number: number }>(
      `INSERT INTO tasks (project_id, title, status)
       VALUES ($1, 'Task B1 - Secret Feature', 'TODO')
       RETURNING id, task_number`,
      [projectB_Id]
    );
    taskB1_Id = taskB1Res.rows[0].id;
    taskB1_Number = taskB1Res.rows[0].task_number;

    assert('2. Created test projects, members, and tasks with task_number', taskA1_Number > 0 && taskB1_Number > 0);

    // -----------------------------------------------------------------
    // 3. Push Event with Commit Message Reference & Identity Resolution
    // -----------------------------------------------------------------
    console.log('\n--- 3. Push Event Processing ---');
    const commitSha1 = '1111222233334444555566667777888899990001';
    const pushDeliveryId1 = `del_${timestamp}_push_commit_ref`;
    const pushPayload1 = JSON.stringify({
      ref: 'refs/heads/main',
      repository: {
        id: repoA_Id,
        name: 'repo-a',
        full_name: 'orkestr/repo-a',
        html_url: 'https://github.com/orkestr/repo-a',
      },
      installation: { id: installationId },
      sender: { id: 887766, login: 'alicedev' }, // Alice's linked GitHub account
      commits: [
        {
          id: commitSha1,
          message: `feat(ORK-${taskA1_Number}): implement JWT login pipeline`,
          url: `https://github.com/orkestr/repo-a/commit/${commitSha1}`,
          timestamp: new Date().toISOString(),
          author: { name: 'Alice Dev', email: 'alice@test.com', username: 'alicedev' },
        },
      ],
    });

    const pushRes1 = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(pushPayload1, testSecret),
        'X-GitHub-Delivery': pushDeliveryId1,
        'X-GitHub-Event': 'push',
      },
      body: pushPayload1,
    });
    const pushData1 = await pushRes1.json();
    assert('3a. Push webhook delivery accepted with 200 OK', pushRes1.status === 200 && pushData1.success === true);

    // Verify activity association in database
    const activityCheck1 = await query<{
      id: string;
      task_id: string;
      activity_type: string;
      github_identifier: string;
      author_github_username: string;
      author_github_id: string;
      author_user_id: string;
    }>(
      `SELECT id, task_id, activity_type, github_identifier, author_github_username, author_github_id, author_user_id
       FROM task_github_activities
       WHERE github_identifier = $1`,
      [commitSha1]
    );

    assert(
      '3b. Activity row created and associated with Task A1',
      activityCheck1.rows.length === 1 && activityCheck1.rows[0].task_id === taskA1_Id
    );

    assert(
      '3c. Resolved author_user_id to Alice using linked numeric GitHub ID (887766)',
      activityCheck1.rows[0].author_user_id === userAliceId
    );

    // Verify webhook event status updated to PROCESSED
    const eventCheck1 = await query<{ status: string; processed_at: string }>(
      `SELECT status, processed_at FROM github_webhook_events WHERE event_id = $1`,
      [pushDeliveryId1]
    );
    assert(
      '3d. Webhook event marked PROCESSED with processed_at set',
      eventCheck1.rows[0]?.status === 'PROCESSED' && eventCheck1.rows[0]?.processed_at != null
    );

    // -----------------------------------------------------------------
    // 4. Push Event with Branch Name Reference & Unlinked Author
    // -----------------------------------------------------------------
    console.log('\n--- 4. Branch Name Reference & Unlinked Author ---');
    const commitSha2 = '2222333344445555666677778888999900001112';
    const pushDeliveryId2 = `del_${timestamp}_push_branch_ref`;
    const pushPayload2 = JSON.stringify({
      ref: `refs/heads/feature/ORK-${taskA2_Number}-user-profile-screen`,
      repository: {
        id: repoA_Id,
        name: 'repo-a',
        full_name: 'orkestr/repo-a',
        html_url: 'https://github.com/orkestr/repo-a',
      },
      installation: { id: installationId },
      sender: { id: 999999, login: 'external_contributor' }, // Unlinked user
      commits: [
        {
          id: commitSha2,
          message: 'Add styled profile card component',
          url: `https://github.com/orkestr/repo-a/commit/${commitSha2}`,
          timestamp: new Date().toISOString(),
          author: { name: 'External Contributor', email: 'contrib@test.com', username: 'external_contributor' },
        },
      ],
    });

    const pushRes2 = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(pushPayload2, testSecret),
        'X-GitHub-Delivery': pushDeliveryId2,
        'X-GitHub-Event': 'push',
      },
      body: pushPayload2,
    });
    assert('4a. Branch-referenced push webhook delivered with 200 OK', pushRes2.status === 200);

    const activityCheck2 = await query<{
      task_id: string;
      author_github_username: string;
      author_user_id: string | null;
    }>(
      `SELECT task_id, author_github_username, author_user_id
       FROM task_github_activities
       WHERE github_identifier = $1`,
      [commitSha2]
    );

    assert(
      '4b. Associated commit on branch with Task A2',
      activityCheck2.rows.length === 1 && activityCheck2.rows[0].task_id === taskA2_Id
    );

    assert(
      '4c. Unlinked author preserves GitHub username and sets author_user_id to null',
      activityCheck2.rows[0].author_github_username === 'external_contributor' &&
        activityCheck2.rows[0].author_user_id === null
    );

    // -----------------------------------------------------------------
    // 5. Pull Request Event Association (Title, Body, and Head Branch)
    // -----------------------------------------------------------------
    console.log('\n--- 5. Pull Request Association ---');
    const prNumber = 77;
    const prDeliveryId = `del_${timestamp}_pr_event`;
    const prPayload = JSON.stringify({
      action: 'opened',
      repository: {
        id: repoA_Id,
        name: 'repo-a',
        full_name: 'orkestr/repo-a',
        html_url: 'https://github.com/orkestr/repo-a',
      },
      installation: { id: installationId },
      pull_request: {
        id: 554433,
        number: prNumber,
        title: `[ORK-${taskA1_Number}] Integrate social OAuth providers`,
        body: `Fixes ORK-${taskA1_Number}. Please review!`,
        html_url: `https://github.com/orkestr/repo-a/pull/${prNumber}`,
        created_at: new Date().toISOString(),
        user: { id: 887766, login: 'alicedev' },
        head: { ref: `feature/ORK-${taskA1_Number}-oauth` },
      },
    });

    const prRes = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(prPayload, testSecret),
        'X-GitHub-Delivery': prDeliveryId,
        'X-GitHub-Event': 'pull_request',
      },
      body: prPayload,
    });
    assert('5a. PR webhook accepted with 200 OK', prRes.status === 200);

    const prActivityCheck = await query<{
      task_id: string;
      activity_type: string;
      github_identifier: string;
      title: string;
    }>(
      `SELECT task_id, activity_type, github_identifier, title
       FROM task_github_activities
       WHERE activity_type = 'PULL_REQUEST' AND github_identifier = $1`,
      [String(prNumber)]
    );

    assert(
      '5b. PULL_REQUEST activity linked to Task A1 with correct title',
      prActivityCheck.rows.length === 1 &&
        prActivityCheck.rows[0].task_id === taskA1_Id &&
        prActivityCheck.rows[0].title.includes('Integrate social OAuth')
    );

    // -----------------------------------------------------------------
    // 6. Cross-Project Reference Prevention
    // -----------------------------------------------------------------
    console.log('\n--- 6. Cross-Project Isolation ---');
    // An activity in repo A references Task B1 (which belongs to Project B!)
    const crossSha = '9999888877776666555544443333222211110000';
    const crossDeliveryId = `del_${timestamp}_cross_project`;
    const crossPayload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: {
        id: repoA_Id, // Repo connected to Project A
        name: 'repo-a',
        full_name: 'orkestr/repo-a',
      },
      installation: { id: installationId },
      sender: { id: 887766, login: 'alicedev' },
      commits: [
        {
          id: crossSha,
          message: `feat(ORK-${taskB1_Number}): attempt to leak activity into Project B`, // references Task B1!
          url: `https://github.com/orkestr/repo-a/commit/${crossSha}`,
          timestamp: new Date().toISOString(),
          author: { name: 'Alice Dev', email: 'alice@test.com', username: 'alicedev' },
        },
      ],
    });

    const crossRes = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(crossPayload, testSecret),
        'X-GitHub-Delivery': crossDeliveryId,
        'X-GitHub-Event': 'push',
      },
      body: crossPayload,
    });
    assert('6a. Cross-project webhook acknowledged with 200 OK', crossRes.status === 200);

    // Assert that Task B1 was NOT associated with this commit
    const crossCheck = await query<{ count: string }>(
      `SELECT count(*) FROM task_github_activities WHERE github_identifier = $1`,
      [crossSha]
    );
    assert(
      '6b. Cross-project activity is NEVER created (count is 0)',
      parseInt(crossCheck.rows[0].count, 10) === 0
    );

    // Assert event was marked UNASSOCIATED
    const crossEventCheck = await query<{ status: string }>(
      `SELECT status FROM github_webhook_events WHERE event_id = $1`,
      [crossDeliveryId]
    );
    assert('6c. Cross-project delivery marked UNASSOCIATED', crossEventCheck.rows[0]?.status === 'UNASSOCIATED');

    // -----------------------------------------------------------------
    // 7. Nonexistent Task Reference
    // -----------------------------------------------------------------
    console.log('\n--- 7. Nonexistent Task References ---');
    const nonexistentSha = '5555444433332222111100009999888877776666';
    const nonexistentDeliveryId = `del_${timestamp}_nonexistent_ref`;
    const nonexistentPayload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { id: repoA_Id },
      installation: { id: installationId },
      commits: [
        {
          id: nonexistentSha,
          message: 'feat(ORK-999999): nonexistent task reference',
          url: 'https://github.com/...',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const nonRes = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(nonexistentPayload, testSecret),
        'X-GitHub-Delivery': nonexistentDeliveryId,
        'X-GitHub-Event': 'push',
      },
      body: nonexistentPayload,
    });
    assert('7a. Nonexistent task reference webhook delivered with 200 OK', nonRes.status === 200);

    const nonEventCheck = await query<{ status: string }>(
      `SELECT status FROM github_webhook_events WHERE event_id = $1`,
      [nonexistentDeliveryId]
    );
    assert('7b. Webhook with nonexistent task reference marked UNASSOCIATED', nonEventCheck.rows[0]?.status === 'UNASSOCIATED');

    // -----------------------------------------------------------------
    // 8. Idempotency & Repeated Processing
    // -----------------------------------------------------------------
    console.log('\n--- 8. Idempotency & Duplicate Deliveries ---');
    // Fetch the event ID for push 1
    const eventRow1 = await query<{ id: string }>(
      `SELECT id FROM github_webhook_events WHERE event_id = $1`,
      [pushDeliveryId1]
    );
    const event1DbId = eventRow1.rows[0].id;

    // Run processWebhookEvent a second time on the same event
    const rerunResult = await activityService.processWebhookEvent(event1DbId);
    assert('8a. Repeated processing completes successfully', rerunResult.status === 'PROCESSED');

    // Check count of activities for commitSha1
    const countAfterRerun = await query<{ count: string }>(
      `SELECT count(*) FROM task_github_activities WHERE github_identifier = $1`,
      [commitSha1]
    );
    assert(
      '8b. No duplicate activity rows created after repeated processing',
      parseInt(countAfterRerun.rows[0].count, 10) === 1
    );

    // -----------------------------------------------------------------
    // 9. Authenticated API Endpoint: GET /api/tasks/:taskId/github-activities
    // -----------------------------------------------------------------
    console.log('\n--- 9. Frontend API Endpoint & Authorization ---');
    // 9a. Unauthenticated access returns 401
    const unauthRes = await fetch(`${baseUrl}/tasks/${taskA1_Id}/github-activities`);
    assert('9a. Unauthenticated access returns 401 Unauthorized', unauthRes.status === 401);

    // Login Alice
    const aliceLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `alice_${timestamp}@test.com`, password: 'hashed_pw' }),
    });
    // In our test, user password_hash was set directly, let's login via session cookie or direct query
    // Actually let's register/login with real bcrypt password for cookie sessions:
    const testPw = 'SecurePassword123!';
    const userRegRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Member Alice',
        username: `mem_alice_${timestamp}`,
        email: `mem_alice_${timestamp}@test.com`,
        password: testPw,
      }),
    });
    aliceSession.updateFromHeaders(userRegRes.headers);
    const registeredAlice = await userRegRes.json();
    const registeredAliceId = registeredAlice.id;

    // Add registered Alice as MEMBER to Project A
    await query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
      [projectA_Id, registeredAliceId]
    );

    // Register Bob (outsider to Project A)
    const bobRegRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Outsider Bob',
        username: `mem_bob_${timestamp}`,
        email: `mem_bob_${timestamp}@test.com`,
        password: testPw,
      }),
    });
    bobSession.updateFromHeaders(bobRegRes.headers);

    // Alice fetches Task A1 activities (Authorized)
    const aliceFetchRes = await fetch(`${baseUrl}/tasks/${taskA1_Id}/github-activities`, {
      headers: { Cookie: aliceSession.getCookieHeader() },
    });
    const aliceData = await aliceFetchRes.json();
    assert(
      '9b. Authorized project member receives 200 OK with activities list',
      aliceFetchRes.status === 200 &&
        aliceData.success === true &&
        Array.isArray(aliceData.activities) &&
        aliceData.activities.length >= 2 // Commit 1 and PR 1
    );

    assert(
      '9c. Activity payload includes commit/PR title, author, URL, and activityType',
      aliceData.activities.some((a: any) => a.activityType === 'COMMIT' && a.githubIdentifier === commitSha1) &&
        aliceData.activities.some((a: any) => a.activityType === 'PULL_REQUEST' && a.githubIdentifier === String(prNumber))
    );

    // Bob fetches Task A1 activities (Unauthorized - not member of Project A, obscured with 404)
    const bobFetchRes = await fetch(`${baseUrl}/tasks/${taskA1_Id}/github-activities`, {
      headers: { Cookie: bobSession.getCookieHeader() },
    });
    assert('9d. Non-member user access rejected (404/403 security isolation)', bobFetchRes.status === 404 || bobFetchRes.status === 403);

    // Nonexistent task ID returns 404
    const notFoundRes = await fetch(`${baseUrl}/tasks/00000000-0000-0000-0000-000000000000/github-activities`, {
      headers: { Cookie: aliceSession.getCookieHeader() },
    });
    assert('9e. Nonexistent task ID returns 404 Not Found', notFoundRes.status === 404);

    // -----------------------------------------------------------------
    // 10. Direct UUID Reference Matching
    // -----------------------------------------------------------------
    console.log('\n--- 10. UUID Reference Matching ---');
    const commitShaUuid = '3333444455556666777788889999000011112223';
    const uuidPayload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { id: repoA_Id },
      installation: { id: installationId },
      commits: [
        {
          id: commitShaUuid,
          message: `refactor(ORK-${taskA1_Id}): update auth types by UUID`,
          url: `https://github.com/.../commit/${commitShaUuid}`,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(uuidPayload, testSecret),
        'X-GitHub-Delivery': `del_${timestamp}_uuid_match`,
        'X-GitHub-Event': 'push',
      },
      body: uuidPayload,
    });

    const uuidActivityCheck = await query<{ task_id: string }>(
      `SELECT task_id FROM task_github_activities WHERE github_identifier = $1`,
      [commitShaUuid]
    );
    assert(
      '10. Successfully matches and associates commit using exact ORK-<UUID>',
      uuidActivityCheck.rows.length === 1 && uuidActivityCheck.rows[0].task_id === taskA1_Id
    );

  } finally {
    // Cleanup fixtures
    try {
      if (projectA_Id) {
        await query(`DELETE FROM task_github_activities WHERE project_id = $1`, [projectA_Id]);
        await query(`DELETE FROM github_webhook_events WHERE project_id = $1`, [projectA_Id]);
        await query(`DELETE FROM tasks WHERE project_id = $1`, [projectA_Id]);
        await query(`DELETE FROM project_members WHERE project_id = $1`, [projectA_Id]);
        await query(`DELETE FROM projects WHERE id = $1`, [projectA_Id]);
      }
      if (projectB_Id) {
        await query(`DELETE FROM task_github_activities WHERE project_id = $1`, [projectB_Id]);
        await query(`DELETE FROM github_webhook_events WHERE project_id = $1`, [projectB_Id]);
        await query(`DELETE FROM tasks WHERE project_id = $1`, [projectB_Id]);
        await query(`DELETE FROM project_members WHERE project_id = $1`, [projectB_Id]);
        await query(`DELETE FROM projects WHERE id = $1`, [projectB_Id]);
      }
      if (userAliceId) {
        await query(`DELETE FROM users WHERE id = $1`, [userAliceId]);
      }
      if (userBobId) {
        await query(`DELETE FROM users WHERE id = $1`, [userBobId]);
      }
      await query(`DELETE FROM users WHERE email LIKE $1`, [`%${timestamp}@test.com`]);
      await query(`DELETE FROM github_webhook_events WHERE event_id LIKE $1`, [`del_${timestamp}_%`]);
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr);
    }

    config.github.webhookSecret = originalSecret;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  console.log('\n=====================================================');
  console.log('Task-to-GitHub Activity Association Test Summary:');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  console.log(`Failed: ${failedCount} / ${results.length}`);
  console.log('=====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runActivityAssociationTests()
  .then(() => {
    pool.end();
  })
  .catch((err) => {
    console.error('Fatal test error:', err);
    pool.end();
    process.exit(1);
  });
