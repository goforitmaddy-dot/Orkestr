import assert from 'node:assert/strict';
import createApp from '../app';
import { Server } from 'node:http';
import { pool, query } from '../db';
import { resetMonitoringState } from './helpers/resetMonitoringState';

/**
 * Collects Server-Sent Events so the test can assert that the browser is
 * genuinely notified when real data changes.
 */
class SseCollector {
  private events: Array<{ type: string; data: unknown }> = [];
  private buffer = '';
  private controller = new AbortController();

  async connect(url: string, cookie?: string): Promise<void> {
    const response = await fetch(url, {
      signal: this.controller.signal,
      headers: cookie ? { Cookie: cookie } : undefined,
    });
    const body = response.body;
    if (!body) throw new Error('SSE response did not expose a readable body');

    const reader = body.getReader();
    const decoder = new TextDecoder();

    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          this.buffer += decoder.decode(value, { stream: true });

          let boundary = this.buffer.indexOf('\n\n');
          while (boundary !== -1) {
            const raw = this.buffer.slice(0, boundary);
            this.buffer = this.buffer.slice(boundary + 2);
            const parsed = this.parse(raw);
            if (parsed) this.events.push(parsed);
            boundary = this.buffer.indexOf('\n\n');
          }
        }
      } catch {
        // The stream was aborted during teardown.
      }
    })();
  }

  private parse(raw: string): { type: string; data: unknown } | null {
    let type = 'message';
    let data = '';

    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }

    if (!data) return null;

    try {
      return { type, data: JSON.parse(data) };
    } catch {
      return { type, data };
    }
  }

  async waitFor(type: string, timeoutMs = 5000): Promise<{ type: string; data: unknown }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.events.find((event) => event.type === type);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const seen = this.events.map((event) => event.type).join(', ') || 'none';
    throw new Error(`Timed out waiting for SSE event "${type}". Events received: ${seen}`);
  }

  get received(): string[] {
    return this.events.map((event) => event.type);
  }

  close(): void {
    this.controller.abort();
  }
}

/**
 * Signs up a throwaway account and returns the session cookie.
 *
 * Every protected endpoint requires a session, so the whole suite runs as a
 * real signed-in user.
 */
async function registerTestUser(
  baseUrl: string
): Promise<{ cookie: string; email: string; userId: string }> {
  const email = `orkestr-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

  const response = await fetch(`${baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Monitor E2E',
      email,
      password: 'correct-horse-battery',
    }),
  });

  assert.equal(response.status, 201);

  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'Signup must set a session cookie');

  const cookie = setCookie.split(';')[0];
  const body = (await response.json()) as { data: { user: { id: string } } };
  return { cookie, email, userId: body.data.user.id };
}

interface ProjectResponse {
  id: string;
  repository: string | null;
  monitoring_enabled: boolean;
}

interface MonitoringTargetResponse {
  repository: string | null;
  monitoringEnabled: boolean;
}

interface MonitoringStatusResponse {
  provider: string;
  credentialsConfigured: boolean;
  monitoredProjectCount: number;
  targets: MonitoringTargetResponse[];
}

interface ApplicationErrorResponse {
  id: string;
  message: string;
  occurrence_count: number;
  affected_users: number | null;
  project_id: string | null;
  status: string;
}

interface ErrorIngestResponse {
  success: boolean;
  created: boolean;
  data: ApplicationErrorResponse;
}

interface MonitoringSummaryResponse {
  activeIncidents: number;
  activeRuntimeErrors: number;
  resolvedRuntimeErrors: number;
  totalActiveErrors: number;
}

interface PollResponse {
  success: boolean;
  message: string;
}

async function testLiveMonitoring() {
  console.log('Testing Real-Time Monitoring (CI + runtime errors, no simulation)...');

  await resetMonitoringState();

  const app = createApp;
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}/api`;
  const sse = new SseCollector();

  let createdProjectId: string | null = null;
  let authHeaders: Record<string, string> = {};
  let createdUserId: string | null = null;
  let createdErrorId: string | null = null;

  try {
    // The suite runs as a real signed-in account.
    const { cookie, userId } = await registerTestUser(baseUrl);
    authHeaders = { Cookie: cookie };
    createdUserId = userId;

    // 0. Protected endpoints reject anonymous callers.
    const anonymousRes = await fetch(`${baseUrl}/projects`);
    assert.equal(anonymousRes.status, 401);
    console.log('✓ Protected endpoints reject requests without a session.');

    const meRes = await fetch(`${baseUrl}/auth/me`, { headers: authHeaders });
    assert.equal(meRes.status, 200);
    const me = (await meRes.json()) as { data: { user: { email: string } } };
    assert.ok(me.data.user.email);
    console.log('✓ GET /api/auth/me returns the signed-in account.');
    // 1. The live event stream is available and announces itself.
    await sse.connect(`${baseUrl}/monitoring/stream`, cookie);
    const streamEvent = await sse.waitFor('monitoring.status');
    assert.equal((streamEvent.data as { connected?: boolean }).connected, true);
    console.log('✓ GET /api/monitoring/stream opens an SSE channel and emits monitoring.status.');

    // 2. The simulation endpoint no longer exists.
    const simulateRes = await fetch(`${baseUrl}/incidents/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ projectName: 'payment-gateway', errorType: 'TEST_FAILURE' }),
    });
    assert.equal(simulateRes.status, 404);
    console.log('✓ POST /api/incidents/simulate is gone - failures can no longer be fabricated.');

    // 3. Monitoring status reports the real configuration.
    const statusRes = await fetch(`${baseUrl}/monitoring/status`, { headers: authHeaders });
    assert.equal(statusRes.status, 200);
    const status = (await statusRes.json()) as MonitoringStatusResponse;
    assert.equal(typeof status.credentialsConfigured, 'boolean');
    assert.equal(status.provider, 'github');
    assert.ok(Array.isArray(status.targets));
    console.log(
      `✓ GET /api/monitoring/status reports credentialsConfigured=${status.credentialsConfigured}, monitored=${status.monitoredProjectCount}.`
    );

    // 4. A project can be linked to a repository and switched to monitoring.
    const createRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        name: `monitor-e2e-${Date.now()}`,
        description: 'Live monitoring end-to-end verification project',
        provider: 'github',
        repository: 'orkestr-e2e/verified-repo',
        monitoringEnabled: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const createdProject = (await createRes.json()) as ProjectResponse;
    createdProjectId = createdProject.id;
    assert.equal(createdProject.repository, 'orkestr-e2e/verified-repo');
    assert.equal(createdProject.monitoring_enabled, true);
    console.log('✓ POST /api/projects links an existing project to a GitHub repository.');

    const linkedStatusRes = await fetch(`${baseUrl}/monitoring/status`, { headers: authHeaders });
    const linkedStatus = (await linkedStatusRes.json()) as MonitoringStatusResponse;
    const target = linkedStatus.targets.find(
      (target: MonitoringTargetResponse) => target.repository === 'orkestr-e2e/verified-repo'
    );
    assert.ok(target, 'Linked project must appear as a monitoring target');
    assert.equal(target.monitoringEnabled, true);
    console.log('✓ GET /api/monitoring/status lists the linked repository as an active target.');

    // 5. A real runtime error is ingested and streamed to subscribers.
    const errorRes = await fetch(`${baseUrl}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'TypeError: Cannot read properties of undefined (reading "checkout")',
        stackTrace:
          'at checkout (src/payments/checkout.ts:42:18)\nat handler (src/api/route.ts:11:9)',
        errorType: 'TypeError',
        service: 'payment-gateway',
        environment: 'production',
        repository: 'orkestr-e2e/verified-repo',
        affectedUsers: 12,
        context: { route: '/api/checkout' },
      }),
    });
    assert.equal(errorRes.status, 201);
    const errorBody = (await errorRes.json()) as ErrorIngestResponse;
    assert.equal(errorBody.success, true);
    assert.equal(errorBody.created, true);
    const errorId = errorBody.data.id;
    createdErrorId = errorId;
    assert.equal(errorBody.data.occurrence_count, 1);
    assert.equal(errorBody.data.project_id, createdProjectId);
    console.log('✓ POST /api/errors records a genuine runtime error and links it to the project.');

    const createdEvent = await sse.waitFor('error.created');
    assert.equal((createdEvent.data as { id: string }).id, errorId);
    console.log('✓ The error.created event was pushed over the SSE stream.');

    // 6. Repeating the same error groups it instead of creating duplicates.
    const repeatRes = await fetch(`${baseUrl}/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'TypeError: Cannot read properties of undefined (reading "checkout")',
        stackTrace:
          'at checkout (src/payments/checkout.ts:42:18)\nat handler (src/api/route.ts:11:9)',
        errorType: 'TypeError',
        service: 'payment-gateway',
        repository: 'orkestr-e2e/verified-repo',
      }),
    });
    assert.equal(repeatRes.status, 200);
    const repeatBody = (await repeatRes.json()) as ErrorIngestResponse;
    assert.equal(repeatBody.created, false);
    assert.equal(repeatBody.data.occurrence_count, 2);
    assert.equal(repeatBody.data.id, errorId);
    console.log('✓ A repeated occurrence increments the counter instead of duplicating the error.');

    // 7. The error is listed and retrievable.
    const listRes = await fetch(`${baseUrl}/errors?status=OPEN`, { headers: authHeaders });
    assert.equal(listRes.status, 200);
    const openErrors = (await listRes.json()) as ApplicationErrorResponse[];
    assert.ok(openErrors.some((e) => e.id === errorId));

    const singleRes = await fetch(`${baseUrl}/errors/${errorId}`, { headers: authHeaders });
    assert.equal(singleRes.status, 200);
    const single = (await singleRes.json()) as ApplicationErrorResponse;
    assert.equal(single.message, 'TypeError: Cannot read properties of undefined (reading "checkout")');
    assert.equal(single.affected_users, 12);
    console.log('✓ GET /api/errors and /api/errors/:id expose the recorded runtime error.');

    // 8. The dashboard summary counts the open error.
    const summaryRes = await fetch(`${baseUrl}/monitoring/summary`, { headers: authHeaders });
    assert.equal(summaryRes.status, 200);
    const summary = (await summaryRes.json()) as MonitoringSummaryResponse;
    assert.equal(summary.activeRuntimeErrors, 1);
    assert.equal(summary.totalActiveErrors, 1);
    console.log('✓ GET /api/monitoring/summary counts the open runtime error.');

    // 9. Manual resolution is recorded and streamed.
    const resolveRes = await fetch(`${baseUrl}/errors/${errorId}/resolve`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(resolveRes.status, 200);
    const resolvedEvent = await sse.waitFor('error.resolved');
    assert.equal((resolvedEvent.data as { id: string }).id, errorId);

    const afterSummaryRes = await fetch(`${baseUrl}/monitoring/summary`, { headers: authHeaders });
    const afterSummary = (await afterSummaryRes.json()) as MonitoringSummaryResponse;
    assert.equal(afterSummary.activeRuntimeErrors, 0);
    assert.equal(afterSummary.resolvedRuntimeErrors, 1);
    console.log('✓ POST /api/errors/:id/resolve resolves the error and pushes error.resolved.');

    // 10. An unknown error id is a 404, not a silent success.
    const missingRes = await fetch(`${baseUrl}/errors/00000000-0000-0000-0000-000000000000`, {
      headers: authHeaders,
    });
    assert.equal(missingRes.status, 404);
    console.log('✓ Unknown runtime error ids return 404.');

    // 11. Incidents remain readable and the CI list endpoint still works.
    const incidentsRes = await fetch(`${baseUrl}/incidents`, { headers: authHeaders });
    assert.equal(incidentsRes.status, 200);
    assert.ok(Array.isArray(await incidentsRes.json()));
    console.log('✓ GET /api/incidents responds with the real incident list.');

    // 12. A manual polling cycle runs on demand.
    const pollRes = await fetch(`${baseUrl}/monitoring/poll`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(pollRes.status, 200);
    const pollBody = (await pollRes.json()) as PollResponse;
    assert.equal(typeof pollBody.success, 'boolean');
    console.log(`✓ POST /api/monitoring/poll ran a cycle (success=${pollBody.success}).`);

    console.log(
      `\n🎉 Real-Time Monitoring End-to-End Test PASSED! (SSE events: ${sse.received.join(', ')})`
    );
  } finally {
    sse.close();
    if (createdProjectId) {
      await fetch(`${baseUrl}/projects/${createdProjectId}`, {
        method: 'DELETE',
        headers: authHeaders,
      }).catch(() => undefined);
    }
    if (createdErrorId) {
      await query(`DELETE FROM application_errors WHERE id = $1;`, [createdErrorId]).catch(
        () => undefined
      );
    }
    if (createdUserId) {
      await query(`DELETE FROM users WHERE id = $1;`, [createdUserId]).catch(() => undefined);
    }
    server.close();
  }
}

testLiveMonitoring()
  .then(async () => {
    // Release the connection pool so the process can exit immediately instead
    // of waiting for the pool idle timeout to drain.
    await pool.end();
  })
  .catch(async (err) => {
    console.error('❌ E2E test failed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
