import { Server } from 'http';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { pool, query } from '../src/db';

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

async function runWebhookTests() {
  console.log('=====================================================');
  console.log('Starting GitHub Webhook Ingestion Foundation Test Suite');
  console.log('=====================================================\n');

  const testSecret = 'test_webhook_secret_super_secure_orkestr_123';
  const originalSecret = config.github.webhookSecret;
  config.github.webhookSecret = testSecret;

  const app = createApp();
  let server: Server;
  const testPort = 5099;
  const baseUrl = `http://localhost:${testPort}/api/webhooks`;

  await new Promise<void>((resolve) => {
    server = app.listen(testPort, () => {
      resolve();
    });
  });

  const timestamp = Date.now();
  const testRepoId = 77889900;
  const testInstallationId = 11223344;
  let testProjectId: string = '';
  let testUserId: string = '';

  try {
    // -----------------------------------------------------------------
    // Setup: Create test user and project with connected repository
    // -----------------------------------------------------------------
    const userRes = await query<{ id: string }>(
      `INSERT INTO users (name, username, email, password_hash)
       VALUES ('Webhook Tester', $1, $2, 'hashed_pw')
       RETURNING id`,
      [`wh_user_${timestamp}`, `wh_user_${timestamp}@test.com`]
    );
    testUserId = userRes.rows[0].id;

    const projectRes = await query<{ id: string }>(
      `INSERT INTO projects (
         name,
         description,
         github_repo_id,
         github_repo_owner,
         github_repo_name,
         github_installation_id,
         github_default_branch,
         github_connection_status,
         github_connected_at
       )
       VALUES (
         'Webhook Ingestion Test Project',
         'Project for webhook persistence tests',
         $1,
         'orkestr-org',
         'webhook-repo',
         $2,
         'main',
         'CONNECTED',
         NOW()
       )
       RETURNING id`,
      [testRepoId, testInstallationId]
    );
    testProjectId = projectRes.rows[0].id;

    await query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [testProjectId, testUserId]
    );

    // =================================================================
    // 1. Missing Required Headers
    // =================================================================
    const samplePayload = JSON.stringify({ repository: { id: testRepoId } });

    // Missing signature header
    const noSigRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Delivery': `del_${timestamp}_1`,
        'X-GitHub-Event': 'push',
      },
      body: samplePayload,
    });
    assert('1a. Missing X-Hub-Signature-256 rejected with 400 Bad Request', noSigRes.status === 400);

    // Missing delivery header
    const noDelRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(samplePayload, testSecret),
        'X-GitHub-Event': 'push',
      },
      body: samplePayload,
    });
    assert('1b. Missing X-GitHub-Delivery rejected with 400 Bad Request', noDelRes.status === 400);

    // Missing event header
    const noEventRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(samplePayload, testSecret),
        'X-GitHub-Delivery': `del_${timestamp}_2`,
      },
      body: samplePayload,
    });
    assert('1c. Missing X-GitHub-Event rejected with 400 Bad Request', noEventRes.status === 400);

    // =================================================================
    // 2. Missing Server Webhook Secret Configuration
    // =================================================================
    config.github.webhookSecret = '';
    const unconfiguredRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(samplePayload, 'some_secret'),
        'X-GitHub-Delivery': `del_${timestamp}_3`,
        'X-GitHub-Event': 'push',
      },
      body: samplePayload,
    });
    assert('2. Missing GITHUB_WEBHOOK_SECRET on server rejected with 503 Service Unavailable', unconfiguredRes.status === 503);
    config.github.webhookSecret = testSecret;

    // =================================================================
    // 3. Valid and Invalid Signatures
    // =================================================================
    // Invalid signature (wrong secret)
    const wrongSigRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(samplePayload, 'wrong_tampered_secret'),
        'X-GitHub-Delivery': `del_${timestamp}_4`,
        'X-GitHub-Event': 'push',
      },
      body: samplePayload,
    });
    assert('3a. Wrong signature rejected with 401 Unauthorized', wrongSigRes.status === 401);

    // Tampered payload
    const tamperedBody = JSON.stringify({ repository: { id: testRepoId }, tampered: true });
    const tamperedRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(samplePayload, testSecret), // signature generated from samplePayload, not tamperedBody
        'X-GitHub-Delivery': `del_${timestamp}_5`,
        'X-GitHub-Event': 'push',
      },
      body: tamperedBody,
    });
    assert('3b. Tampered payload rejected with 401 Unauthorized', tamperedRes.status === 401);

    // Malformed signature format (no sha256= prefix)
    const malformedSigRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'md5=invalid_prefix_signature_format',
        'X-GitHub-Delivery': `del_${timestamp}_6`,
        'X-GitHub-Event': 'push',
      },
      body: samplePayload,
    });
    assert('3c. Malformed signature header format rejected with 401 Unauthorized', malformedSigRes.status === 401);

    // Missing signature header on pull_request event is strictly rejected
    const noSigPrRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Delivery': `del_${timestamp}_1_pr`,
        'X-GitHub-Event': 'pull_request',
      },
      body: samplePayload,
    });
    assert('1a-pr. Missing X-Hub-Signature-256 on pull_request rejected with 400 Bad Request', noSigPrRes.status === 400);

    // Unsigned ping event passes narrowly-scoped ping-only path without persistence
    const unsignedPingDeliveryId = `del_${timestamp}_unsigned_ping`;
    const unsignedPingPayload = JSON.stringify({ zen: 'Mind your words.', hook_id: 998877 });
    const unsignedPingRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Delivery': unsignedPingDeliveryId,
        'X-GitHub-Event': 'ping',
      },
      body: unsignedPingPayload,
    });
    const unsignedPingData = await unsignedPingRes.json();
    assert(
      '1d. Unsigned ping event acknowledged with 200 OK and advisory warning',
      unsignedPingRes.status === 200 &&
        unsignedPingData.success === true &&
        unsignedPingData.ping === true &&
        typeof unsignedPingData.warning === 'string'
    );

    // Verify unsigned ping did NOT persist any record in github_webhook_events
    const pingDbCheck = await query<{ count: string }>(
      `SELECT count(*) FROM github_webhook_events WHERE event_id = $1`,
      [unsignedPingDeliveryId]
    );
    assert(
      '1e. Unsigned ping event does NOT persist to github_webhook_events',
      parseInt(pingDbCheck.rows[0].count, 10) === 0
    );

    // Invalid signature on ping event is rejected with 401
    const invalidSigPingRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(unsignedPingPayload, 'wrong_secret'),
        'X-GitHub-Delivery': `del_${timestamp}_invalid_ping`,
        'X-GitHub-Event': 'ping',
      },
      body: unsignedPingPayload,
    });
    assert('1f. Ping event with invalid signature rejected with 401 Unauthorized', invalidSigPingRes.status === 401);

    // Wrong signature on pull_request rejected with 401
    const wrongSigPrRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(samplePayload, 'wrong_tampered_secret'),
        'X-GitHub-Delivery': `del_${timestamp}_4_pr`,
        'X-GitHub-Event': 'pull_request',
      },
      body: samplePayload,
    });
    assert('3a-pr. Wrong signature on pull_request rejected with 401 Unauthorized', wrongSigPrRes.status === 401);

    // Valid signed ping event passes signature check
    const signedPingDeliveryId = `del_${timestamp}_ping`;
    const pingPayload = JSON.stringify({ zen: 'Keep it logically awesome.', hook_id: 123456 });
    const pingRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(pingPayload, testSecret),
        'X-GitHub-Delivery': signedPingDeliveryId,
        'X-GitHub-Event': 'ping',
      },
      body: pingPayload,
    });
    const pingData = await pingRes.json();
    assert('3d. Valid signature on ping event accepted with 200 OK', pingRes.status === 200 && pingData.success === true);

    // Verify valid signed ping did NOT persist any record in github_webhook_events
    const signedPingDbCheck = await query<{ count: string }>(
      `SELECT count(*) FROM github_webhook_events WHERE event_id = $1`,
      [signedPingDeliveryId]
    );
    assert(
      '3e. Valid signed ping event does NOT persist to github_webhook_events',
      parseInt(signedPingDbCheck.rows[0].count, 10) === 0
    );

    // =================================================================
    // 4. Malformed JSON (Only parsed AFTER signature verification)
    // =================================================================
    const malformedJsonString = '{"repository": {"id": 123}, invalid_json_syntax: true,,,';
    const malformedJsonRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(malformedJsonString, testSecret),
        'X-GitHub-Delivery': `del_${timestamp}_malformed`,
        'X-GitHub-Event': 'push',
      },
      body: malformedJsonString,
    });
    assert('4. Malformed JSON with valid HMAC signature rejected with 400 Bad Request', malformedJsonRes.status === 400);

    // =================================================================
    // 5. Push Event Persistence & Metadata Extraction
    // =================================================================
    const pushDeliveryId = `del_${timestamp}_push_1`;
    const pushPayloadObj = {
      ref: 'refs/heads/feature/auth-pipeline',
      before: 'a1b2c3d4e5f60718293041526374859607182930',
      after: 'b2c3d4e5f6a10718293041526374859607182931',
      repository: {
        id: testRepoId,
        name: 'webhook-repo',
        full_name: 'orkestr-org/webhook-repo',
      },
      installation: {
        id: testInstallationId,
      },
      commits: [
        {
          id: 'c3d4e5f6a1b20718293041526374859607182932',
          message: 'Implement user token verification',
          timestamp: '2026-10-23T02:00:00Z',
          author: { name: 'Untrusted Name', email: 'untrusted@email.com' },
        },
        {
          id: 'b2c3d4e5f6a10718293041526374859607182931',
          message: 'Add security middleware tests',
          timestamp: '2026-10-23T02:05:00Z',
          author: { name: 'Untrusted Name', email: 'untrusted@email.com' },
        },
      ],
      sender: {
        id: 998877,
        login: 'github-dev-user',
      },
    };
    const pushPayloadString = JSON.stringify(pushPayloadObj);

    const pushRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(pushPayloadString, testSecret),
        'X-GitHub-Delivery': pushDeliveryId,
        'X-GitHub-Event': 'push',
      },
      body: pushPayloadString,
    });
    const pushData = await pushRes.json();

    assert(
      '5a. Push event ingested successfully with 200 OK and PENDING status',
      pushRes.status === 200 &&
        pushData.success === true &&
        pushData.status === 'PENDING' &&
        pushData.projectId === testProjectId
    );

    // Verify database record
    const pushDbRes = await query<{
      id: string;
      event_id: string;
      event_type: string;
      project_id: string;
      status: string;
      processed_at: string | null;
      github_repo_id: string;
      github_installation_id: string;
      payload: any;
    }>(
      `SELECT id, event_id, event_type, project_id, status, processed_at,
              github_repo_id, github_installation_id, payload
       FROM github_webhook_events
       WHERE event_id = $1`,
      [pushDeliveryId]
    );

    const pushRecord = pushDbRes.rows[0];
    assert(
      '5b. Push event record persisted with correct project_id and valid status',
      pushDbRes.rows.length === 1 &&
        pushRecord.event_type === 'push' &&
        pushRecord.project_id === testProjectId &&
        (pushRecord.status === 'PENDING' || pushRecord.status === 'UNASSOCIATED' || pushRecord.status === 'PROCESSED') &&
        String(pushRecord.github_repo_id) === String(testRepoId) &&
        String(pushRecord.github_installation_id) === String(testInstallationId)
    );

    // =================================================================
    // 6. Duplicate Delivery Deduplication
    // =================================================================
    const dupRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(pushPayloadString, testSecret),
        'X-GitHub-Delivery': pushDeliveryId, // Same delivery ID as in step 5
        'X-GitHub-Event': 'push',
      },
      body: pushPayloadString,
    });
    const dupData = await dupRes.json();

    assert(
      '6a. Duplicate delivery handled idempotently with 200 OK and duplicate: true',
      dupRes.status === 200 && dupData.duplicate === true && dupData.success === true
    );

    const dupCountRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM github_webhook_events WHERE event_id = $1`,
      [pushDeliveryId]
    );
    assert('6b. Database maintains exactly one record for duplicate delivery ID', dupCountRes.rows[0].count === '1');

    // =================================================================
    // 7. Pull Request Event Persistence
    // =================================================================
    const prDeliveryId = `del_${timestamp}_pr_1`;
    const prPayloadObj = {
      action: 'opened',
      number: 42,
      repository: {
        id: testRepoId,
        name: 'webhook-repo',
        full_name: 'orkestr-org/webhook-repo',
      },
      installation: {
        id: testInstallationId,
      },
      pull_request: {
        id: 99881122,
        number: 42,
        state: 'open',
        title: 'Feature: Automated GitHub Task Verification',
        head: {
          ref: 'feature/task-verification',
          sha: 'f1e2d3c4b5a60718293041526374859607182944',
        },
        base: {
          ref: 'main',
          sha: 'a1b2c3d4e5f60718293041526374859607182930',
        },
      },
      sender: {
        id: 998877,
        login: 'github-dev-user',
      },
    };
    const prPayloadString = JSON.stringify(prPayloadObj);

    const prRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(prPayloadString, testSecret),
        'X-GitHub-Delivery': prDeliveryId,
        'X-GitHub-Event': 'pull_request',
      },
      body: prPayloadString,
    });
    const prData = await prRes.json();

    assert(
      '7a. Pull request event ingested successfully with 200 OK and PENDING status',
      prRes.status === 200 &&
        prData.success === true &&
        prData.status === 'PENDING' &&
        prData.projectId === testProjectId
    );

    const prDbRes = await query<{
      id: string;
      event_type: string;
      project_id: string;
      status: string;
      processed_at: string | null;
      payload: any;
    }>(
      `SELECT id, event_type, project_id, status, processed_at, payload
       FROM github_webhook_events
       WHERE event_id = $1`,
      [prDeliveryId]
    );

    const prRecord = prDbRes.rows[0];
    assert(
      '7b. Pull request event persisted with valid status and correct project association',
      prDbRes.rows.length === 1 &&
        prRecord.event_type === 'pull_request' &&
        prRecord.project_id === testProjectId &&
        (prRecord.status === 'PENDING' || prRecord.status === 'UNASSOCIATED' || prRecord.status === 'PROCESSED')
    );

    // =================================================================
    // 8. Unknown Repositories (Not connected to any active Orkestr project)
    // =================================================================
    const unknownRepoDeliveryId = `del_${timestamp}_unknown_repo`;
    const unknownRepoId = 999999999; // Non-existent repository ID
    const unknownRepoPayload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: {
        id: unknownRepoId,
        name: 'untracked-repo',
        full_name: 'outsider/untracked-repo',
      },
      commits: [],
    });

    const unknownRepoRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(unknownRepoPayload, testSecret),
        'X-GitHub-Delivery': unknownRepoDeliveryId,
        'X-GitHub-Event': 'push',
      },
      body: unknownRepoPayload,
    });
    const unknownRepoData = await unknownRepoRes.json();

    assert(
      '8a. Webhook for unknown repository acknowledged with 200 OK and ignored: true',
      unknownRepoRes.status === 200 &&
        unknownRepoData.success === true &&
        unknownRepoData.ignored === true &&
        unknownRepoData.projectId === null
    );

    const unknownDbRes = await query<{ project_id: string | null; status: string }>(
      `SELECT project_id, status FROM github_webhook_events WHERE event_id = $1`,
      [unknownRepoDeliveryId]
    );
    assert(
      '8b. Unknown repository event persisted with project_id NULL and status IGNORED',
      unknownDbRes.rows.length === 1 &&
        unknownDbRes.rows[0].project_id === null &&
        unknownDbRes.rows[0].status === 'IGNORED'
    );

    // 8c. Resolution by Owner/Repo Name fallback & auto-backfilling of github_repo_id
    const ownerNameProjectRes = await query<{ id: string }>(
      `INSERT INTO projects (name, description, github_repo_owner, github_repo_name, github_connection_status)
       VALUES ('Fallback Owner Project', 'Testing owner/name resolution', 'acme-inc', 'service-backend', 'CONNECTED')
       RETURNING id`
    );
    const ownerNameProjectId = ownerNameProjectRes.rows[0].id;
    const dynamicRepoId = 88776655;
    const fallbackDeliveryId = `del_${timestamp}_fallback_owner_name`;
    const fallbackPayload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: {
        id: dynamicRepoId,
        name: 'service-backend',
        full_name: 'acme-inc/service-backend',
        owner: { login: 'acme-inc' },
      },
      installation: { id: 334455 },
      commits: [],
    });

    const fallbackRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(fallbackPayload, testSecret),
        'X-GitHub-Delivery': fallbackDeliveryId,
        'X-GitHub-Event': 'push',
      },
      body: fallbackPayload,
    });
    const fallbackData = await fallbackRes.json();
    assert(
      '8c. Repository resolved successfully by owner/name fallback and matched correct project',
      fallbackRes.status === 200 && fallbackData.projectId === ownerNameProjectId
    );

    // Verify github_repo_id and github_installation_id were backfilled
    const backfilledProject = await query<{ github_repo_id: string; github_installation_id: string }>(
      `SELECT github_repo_id, github_installation_id FROM projects WHERE id = $1`,
      [ownerNameProjectId]
    );
    assert(
      '8d. Project github_repo_id and github_installation_id automatically backfilled upon webhook delivery',
      String(backfilledProject.rows[0].github_repo_id) === String(dynamicRepoId) &&
        String(backfilledProject.rows[0].github_installation_id) === '334455'
    );

    await query(`DELETE FROM github_webhook_events WHERE event_id = $1`, [fallbackDeliveryId]);
    await query(`DELETE FROM projects WHERE id = $1`, [ownerNameProjectId]);

    // =================================================================
    // 9. Repository/Installation Mismatches
    // =================================================================
    const mismatchDeliveryId = `del_${timestamp}_mismatch`;
    const mismatchInstallationId = 99887766; // Different from testInstallationId (11223344)
    const mismatchPayload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: {
        id: testRepoId,
        name: 'webhook-repo',
        full_name: 'orkestr-org/webhook-repo',
      },
      installation: {
        id: mismatchInstallationId, // Mismatched installation
      },
      commits: [],
    });

    const mismatchRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(mismatchPayload, testSecret),
        'X-GitHub-Delivery': mismatchDeliveryId,
        'X-GitHub-Event': 'push',
      },
      body: mismatchPayload,
    });

    assert(
      '9. Repository and installation ID mismatch rejected with 400 Bad Request',
      mismatchRes.status === 400
    );

    // =================================================================
    // 10. Unsupported Event Types
    // =================================================================
    const unsupportedDeliveryId = `del_${timestamp}_unsupported`;
    const unsupportedPayload = JSON.stringify({
      action: 'opened',
      issue: { id: 1, title: 'Bug report' },
      repository: { id: testRepoId },
    });

    const unsupportedRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(unsupportedPayload, testSecret),
        'X-GitHub-Delivery': unsupportedDeliveryId,
        'X-GitHub-Event': 'issues', // Unsupported event type
      },
      body: unsupportedPayload,
    });
    const unsupportedData = await unsupportedRes.json();

    assert(
      '10. Unsupported event type (issues) safely ignored with 200 OK without processing',
      unsupportedRes.status === 200 &&
        unsupportedData.success === true &&
        unsupportedData.ignored === true &&
        unsupportedData.status === 'IGNORED'
    );

    // =================================================================
    // 11. Database Failure Handling
    // =================================================================
    // Temporarily point query to invalid syntax or test error propagation in controller
    const dbFailDeliveryId = `del_${timestamp}_db_fail`;
    // Pass a payload with invalid field type that would cause PostgreSQL error if unhandled
    // Or verify controller passes DB errors to errorHandler with 500
    // We can simulate an AppError or test that internal errors return 500
    const dbFailPayload = JSON.stringify({
      repository: { id: 'invalid_non_numeric_repo_id_causing_int_error' },
    });

    const dbFailRes = await fetch(`${baseUrl}/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': computeSignature(dbFailPayload, testSecret),
        'X-GitHub-Delivery': dbFailDeliveryId,
        'X-GitHub-Event': 'push',
      },
      body: dbFailPayload,
    });

    assert(
      '11. Database/payload processing failure handled safely without crashing (status >= 400)',
      dbFailRes.status >= 400
    );

    // =================================================================
    // 12. Non-interference with regular JSON routes
    // =================================================================
    const healthRes = await fetch(`http://localhost:${testPort}/api/health`);
    assert('12a. Regular GET /api/health continues to function normally', healthRes.status === 200);

    const normalJsonRes = await fetch(`http://localhost:${testPort}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@test.com', password: 'Password123!' }),
    });
    assert('12b. Standard JSON routes (e.g. POST /api/auth/login) parse body without interference', normalJsonRes.status === 401);

  } finally {
    // Cleanup
    try {
      if (testProjectId) {
        await query(`DELETE FROM github_webhook_events WHERE project_id = $1`, [testProjectId]);
        await query(`DELETE FROM project_members WHERE project_id = $1`, [testProjectId]);
        await query(`DELETE FROM projects WHERE id = $1`, [testProjectId]);
      }
      if (testUserId) {
        await query(`DELETE FROM users WHERE id = $1`, [testUserId]);
      }
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
  console.log('GitHub Webhooks Test Summary:');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  console.log(`Failed: ${failedCount} / ${results.length}`);
  console.log('=====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runWebhookTests().then(() => {
  pool.end();
}).catch((err) => {
  console.error('Test execution fatal error:', err);
  pool.end();
  process.exit(1);
});
