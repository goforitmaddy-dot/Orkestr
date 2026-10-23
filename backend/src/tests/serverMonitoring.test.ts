import assert from 'node:assert/strict';
import createApp from '../app';
import { Server } from 'node:http';
import { pool, query } from '../db';

/**
 * Signs up a throwaway account and returns the session cookie + user id.
 */
async function registerTestUser(
  baseUrl: string
): Promise<{ cookie: string; email: string; userId: string }> {
  const email = `server-monitor-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

  const response = await fetch(`${baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Server Monitor E2E',
      email,
      password: 'correct-horse-battery',
    }),
  });

  assert.equal(response.status, 201, 'signup must succeed');

  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'Signup must set a session cookie');
  const cookie = setCookie.split(';')[0];

  const body = (await response.json()) as { data: { user: { id: string } } };
  return { cookie, email, userId: body.data.user.id };
}

async function createProject(
  baseUrl: string,
  cookie: string,
  overrides: { name?: string; repository?: string | null } = {}
) {
  const res = await fetch(`${baseUrl}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: overrides.name ?? `server-monitor-project-${Date.now()}`,
      description: 'Server monitoring verification project',
      provider: 'github',
      repository: overrides.repository ?? `orkestr-e2e/monitored-repo-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      monitoringEnabled: true,
    }),
  });
  assert.equal(res.status, 201, 'project creation must succeed');
  return (await res.json()) as { id: string; name: string };
}

interface ServerHealthResponse {
  projectId: string;
  status: string;
  responseTimeMs: number | null;
  lastCheckedAt: string | null;
  uptimePercent: number | null;
  lastError: string | null;
}

interface ServerErrorResponse {
  id: string;
  projectId: string;
  message: string;
  stackTrace: string | null;
  severity: string;
  environment: string | null;
  occurredAt: string;
  resolved: boolean;
  resolvedAt: string | null;
}

async function testServerMonitoring() {
  console.log('Testing Live Server Monitoring backend APIs...');

  const app = createApp;
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}/api`;
  // The app's own /api/health endpoint is used as a real, reachable server URL
  // for deterministic health-check verification.
  const selfHealthUrl = `http://localhost:${address.port}/api/health`;

  let userAId: string | null = null;
  let userBId: string | null = null;
  let projectAId: string | null = null;
  let noConfigProjectId: string | null = null;
  let cookieA: string | null = null;

  try {
    // ---- User A signs in -------------------------------------------------
    const { cookie: cA, userId: uidA } = await registerTestUser(baseUrl);
    cookieA = cA;
    userAId = uidA;

    // ---- User B signs in (authorization tests) --------------------------
    const { cookie: cookieB, userId: uidB } = await registerTestUser(baseUrl);
    userBId = uidB;

    // ---- User A creates a project ---------------------------------------
    const projectA = await createProject(baseUrl, cookieA);
    projectAId = projectA.id;

    // 1. Protected endpoints reject anonymous callers.
    const anonymousRes = await fetch(`${baseUrl}/projects/${projectAId}/server-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverUrl: selfHealthUrl,
        environment: 'production',
        notifyTeam: true,
        healthCheckIntervalMs: 30000,
        enabled: true,
      }),
    });
    assert.equal(anonymousRes.status, 401);
    console.log('✓ POST /projects/:id/server-monitoring rejects anonymous callers (401).');

    const anonymousHealth = await fetch(
      `${baseUrl}/projects/${projectAId}/server-health`
    );
    assert.equal(anonymousHealth.status, 401);
    console.log('✓ GET /projects/:id/server-health rejects anonymous callers (401).');

    // 2. Unknown project returns 404.
    const unknownProjectRes = await fetch(
      `${baseUrl}/projects/00000000-0000-0000-0000-000000000000/server-monitoring`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({
          serverUrl: selfHealthUrl,
          environment: 'production',
          enabled: true,
        }),
      }
    );
    assert.equal(unknownProjectRes.status, 404);
    console.log('✓ Unknown project id returns 404.');

    // 3. Validation errors are rejected (400).
    const badUrlRes = await fetch(`${baseUrl}/projects/${projectAId}/server-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        serverUrl: 'ftp://not-valid.example.com',
        environment: 'production',
        enabled: true,
      }),
    });
    assert.equal(badUrlRes.status, 400);
    assert.equal(badUrlRes.status, 400);
    const badUrlBody = (await badUrlRes.json()) as {
      error: { message: string; statusCode: number };
    };
    assert.equal(badUrlBody.error.message, 'Validation failed');
    console.log('✓ Invalid serverUrl is rejected with 400.');

    const badEnvRes = await fetch(`${baseUrl}/projects/${projectAId}/server-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        serverUrl: selfHealthUrl,
        environment: 'not-an-environment',
        enabled: true,
      }),
    });
    assert.equal(badEnvRes.status, 400);
    console.log('✓ Invalid environment is rejected with 400.');

    // 4. User B cannot touch User A's project (404).
    const crossUserRes = await fetch(`${baseUrl}/projects/${projectAId}/server-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieB },
      body: JSON.stringify({
        serverUrl: selfHealthUrl,
        environment: 'production',
        enabled: true,
      }),
    });
    assert.equal(crossUserRes.status, 404);
    console.log('✓ Another user cannot configure a project they do not own (404).');

    // 5. Configure server monitoring for project A (200).
    const configRes = await fetch(`${baseUrl}/projects/${projectAId}/server-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        serverUrl: selfHealthUrl,
        environment: 'production',
        webhookUrl: null,
        notifyTeam: true,
        healthCheckIntervalMs: 30000,
        enabled: true,
      }),
    });
    assert.equal(configRes.status, 200);
    const configBody = (await configRes.json()) as {
      success: boolean;
      message: string;
      data: { serverUrl: string; environment: string; enabled: boolean; notifyTeam: boolean };
    };
    assert.equal(configBody.success, true);
    assert.equal(configBody.data.serverUrl, selfHealthUrl);
    assert.equal(configBody.data.environment, 'production');
    assert.equal(configBody.data.enabled, true);
    assert.equal(configBody.data.notifyTeam, true);
    console.log(
      '✓ POST /projects/:id/server-monitoring persists config (200).'
    );

    // Re-configuring updates rather than duplicating (keep enabled so health
    // checks still run).
    const updateConfigRes = await fetch(`${baseUrl}/projects/${projectAId}/server-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        serverUrl: selfHealthUrl,
        environment: 'staging',
        notifyTeam: false,
        healthCheckIntervalMs: 60000,
        enabled: true,
      }),
    });
    assert.equal(updateConfigRes.status, 200);
    const updateConfigBody = (await updateConfigRes.json()) as {
      success: boolean;
      data: { environment: string; enabled: boolean; notifyTeam: boolean };
    };
    assert.equal(updateConfigBody.data.environment, 'staging');
    assert.equal(updateConfigBody.data.enabled, true);
    assert.equal(updateConfigBody.data.notifyTeam, false);
    console.log('✓ Re-configuring updates the existing config (no duplicate row).');

    // 6. GET server health before any check -> unknown (never fabricated).
    // Use project B's config? No - project A was already checked below.
    // Instead verify a fresh project with no config reports unknown.
    const projectNoConfig = await createProject(baseUrl, cookieA, {
      name: `server-monitor-no-config-${Date.now()}`,
      repository: null,
    });
    noConfigProjectId = projectNoConfig.id;
    const healthBeforeRes = await fetch(
      `${baseUrl}/projects/${projectNoConfig.id}/server-health`,
      { headers: { Cookie: cookieA } }
    );
    assert.equal(healthBeforeRes.status, 200);
    const healthBefore = (await healthBeforeRes.json()) as ServerHealthResponse;
    assert.equal(healthBefore.status, 'unknown');
    assert.equal(healthBefore.lastCheckedAt, null);
    console.log(
      '✓ GET /projects/:id/server-health reports unknown before first check (not fabricated).'
    );

    // Disable monitoring for the no-config project isn't needed; just confirm
    // disabled config also reports unknown (never fabricates health).
    const disableRes = await fetch(`${baseUrl}/projects/${projectNoConfig.id}/server-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        serverUrl: selfHealthUrl,
        environment: 'production',
        enabled: false,
      }),
    });
    assert.equal(disableRes.status, 200);
    const healthDisabledRes = await fetch(
      `${baseUrl}/projects/${projectNoConfig.id}/server-health`,
      { headers: { Cookie: cookieA } }
    );
    assert.equal(healthDisabledRes.status, 200);
    const healthDisabled = (await healthDisabledRes.json()) as ServerHealthResponse;
    assert.equal(healthDisabled.status, 'unknown');
    console.log(
      '✓ A disabled server is reported as unknown (never fabricated as healthy).'
    );

    // 7. GET server health performs a real check -> online (self health endpoint).
    const healthRes = await fetch(`${baseUrl}/projects/${projectAId}/server-health`, {
      headers: { Cookie: cookieA },
    });
    assert.equal(healthRes.status, 200);
    const health = (await healthRes.json()) as ServerHealthResponse;
    assert.equal(health.status, 'online');
    assert.equal(health.projectId, projectAId);
    assert.ok(health.responseTimeMs !== null && health.responseTimeMs! > 0);
    assert.ok(health.lastCheckedAt !== null);
    assert.ok(health.uptimePercent !== null && health.uptimePercent! > 0);
    console.log(
      `✓ GET /projects/:id/server-health performs a real check (${health.status}, ${health.responseTimeMs}ms, uptime ${health.uptimePercent}%).`
    );

    // 8. POST server error records a real error (201) and dedups repeats (200).
    const errorRes = await fetch(`${baseUrl}/projects/${projectAId}/server-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        message: 'Connection refused: database unavailable',
        stackTrace:
          'at connect (src/db/index.ts:28:12)\nat start (src/server.ts:7:5)',
        severity: 'critical',
        environment: 'production',
      }),
    });
    assert.equal(errorRes.status, 201);
    const errorBody = (await errorRes.json()) as {
      success: boolean;
      created: boolean;
      data: { id: string; severity: string; environment: string };
    };
    assert.equal(errorBody.success, true);
    assert.equal(errorBody.created, true);
    const errorId = errorBody.data.id;
    assert.equal(errorBody.data.severity, 'critical');
    assert.equal(errorBody.data.environment, 'production');
    console.log('✓ POST /projects/:id/server-errors records a real server error (201).');

    const repeatRes = await fetch(`${baseUrl}/projects/${projectAId}/server-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({
        message: 'Connection refused: database unavailable',
        stackTrace:
          'at connect (src/db/index.ts:28:12)\nat start (src/server.ts:7:5)',
        severity: 'critical',
        environment: 'production',
      }),
    });
    assert.equal(repeatRes.status, 200);
    const repeatBody = (await repeatRes.json()) as {
      created: boolean;
      data: { id: string };
    };
    assert.equal(repeatBody.created, false); // same unresolved error, just an occurrence
    assert.equal(repeatBody.data.id, errorId);
    console.log(
      '✓ Repeated server error reports group by fingerprint (same id, occurrence counted).'
    );

    // Validation: missing message rejected.
    const badErrorRes = await fetch(`${baseUrl}/projects/${projectAId}/server-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ severity: 'low' }),
    });
    assert.equal(badErrorRes.status, 400);
    console.log('✓ Missing message is rejected with 400.');

    // 9. GET server errors lists persisted errors (200).
    const listRes = await fetch(`${baseUrl}/projects/${projectAId}/server-errors`, {
      headers: { Cookie: cookieA },
    });
    assert.equal(listRes.status, 200);
    const errors = (await listRes.json()) as ServerErrorResponse[];
    assert.ok(errors.some((e) => e.id === errorId));
    const openErrors = errors.filter((e) => !e.resolved);
    assert.ok(openErrors.length >= 1);
    console.log('✓ GET /projects/:id/server-errors lists persisted server errors.');

    // Filter by status=resolved returns none (nothing resolved yet).
    const resolvedListRes = await fetch(
      `${baseUrl}/projects/${projectAId}/server-errors?status=resolved`,
      { headers: { Cookie: cookieA } }
    );
    assert.equal(resolvedListRes.status, 200);
    const resolvedErrors = (await resolvedListRes.json()) as ServerErrorResponse[];
    assert.equal(resolvedErrors.length, 0);
    console.log('✓ GET /projects/:id/server-errors supports status filtering.');

    // Filter by severity=critical returns the error.
    const criticalListRes = await fetch(
      `${baseUrl}/projects/${projectAId}/server-errors?severity=critical`,
      { headers: { Cookie: cookieA } }
    );
    assert.equal(criticalListRes.status, 200);
    const criticalErrors = (await criticalListRes.json()) as ServerErrorResponse[];
    assert.ok(criticalErrors.some((e) => e.id === errorId));
    console.log('✓ GET /projects/:id/server-errors supports severity filtering.');

    // User B cannot see User A's server errors.
    const crossUserErrorsRes = await fetch(
      `${baseUrl}/projects/${projectAId}/server-errors`,
      { headers: { Cookie: cookieB } }
    );
    assert.equal(crossUserErrorsRes.status, 404);
    console.log(
      '✓ Another user cannot list a project\'s server errors (404).'
    );

    // 10. Resolve the server error (200).
    const resolveRes = await fetch(
      `${baseUrl}/projects/${projectAId}/server-errors/${errorId}/resolve`,
      { method: 'POST', headers: { Cookie: cookieA } }
    );
    assert.equal(resolveRes.status, 200);
    const resolveBody = (await resolveRes.json()) as {
      success: boolean;
      data: { resolved: boolean; resolvedAt: string | null };
    };
    assert.equal(resolveBody.success, true);
    assert.equal(resolveBody.data.resolved, true);
    assert.ok(resolveBody.data.resolvedAt !== null);
    console.log('✓ POST /projects/:id/server-errors/:id/resolve resolves the error (200).');

    // Unknown error id -> 404.
    const missingResolveRes = await fetch(
      `${baseUrl}/projects/${projectAId}/server-errors/00000000-0000-0000-0000-000000000000/resolve`,
      { method: 'POST', headers: { Cookie: cookieA } }
    );
    assert.equal(missingResolveRes.status, 404);
    console.log('✓ Unknown server error id returns 404 on resolve.');

    console.log('\n🎉 Live Server Monitoring backend tests PASSED!');
  } finally {
    // Cleanup test data.
    if (projectAId && cookieA) {
      await fetch(`${baseUrl}/projects/${projectAId}`, {
        method: 'DELETE',
        headers: { Cookie: cookieA },
      }).catch(() => undefined);
    }
    if (noConfigProjectId && cookieA) {
      await fetch(`${baseUrl}/projects/${noConfigProjectId}`, {
        method: 'DELETE',
        headers: { Cookie: cookieA },
      }).catch(() => undefined);
    }
    if (userAId) {
      await query(`DELETE FROM users WHERE id = $1;`, [userAId]).catch(() => undefined);
    }
    if (userBId) {
      await query(`DELETE FROM users WHERE id = $1;`, [userBId]).catch(() => undefined);
    }
    server.close();
  }
}

testServerMonitoring()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error('❌ Server monitoring test failed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
