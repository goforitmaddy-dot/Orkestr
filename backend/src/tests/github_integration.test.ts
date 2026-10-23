import assert from 'node:assert/strict';
import createApp from '../app';
import { Server } from 'node:http';
import { pool, query } from '../db';
import { resetMonitoringState } from './helpers/resetMonitoringState';

/**
 * GitHub integration regression suite.
 *
 * Covers the inconsistency where Settings reported a verified personal token
 * while the global header still said "No token", plus the polling pipeline:
 * the header/status endpoints must reflect the signed-in account's saved
 * connection, `Poll Now` must use that verified token and the repository
 * selected in Projects, and a real GitHub API failure must never be reported
 * as success.
 *
 * GitHub itself is stubbed with `globalThis.fetch`, so the suite is
 * deterministic and never depends on network access or a live token.
 */

interface GitHubHealthResponse {
  services: { monitoring: 'configured' | 'unconfigured' };
  github: {
    userTokenConfigured: boolean;
    serverTokenConfigured: boolean;
    connectionStatus: string;
    accountLogin: string | null;
    source: 'user' | 'server' | 'none';
  };
}

interface MonitoringStatusResponse {
  credentialsConfigured: boolean;
  serverTokenConfigured: boolean;
  userConnections: { total: number; valid: number; invalid: number };
  userConnection: { status: string; accountLogin: string | null } | null;
  monitoredProjectCount: number;
  targets: Array<{
    repository: string | null;
    workflowRunsInspected: number;
    failedRunsFound: number;
    failuresDetected: number;
    lastError: string | null;
  }>;
}

interface PollResponse {
  success: boolean;
  message: string;
  data: {
    projectsPolled: number;
    repositoriesChecked: string[];
    workflowRunsInspected: number;
    failedRunsFound: number;
    failuresDetected: number;
    githubApiErrors: Array<{ repository: string; message: string; status?: number }>;
    targets: Array<{ repository: string; workflowRunsInspected: number; failedRunsFound: number }>;
    skipped: boolean;
  } | null;
}

interface IncidentResponse {
  id: string;
  repository_name: string;
  workflow_name: string;
  status: string;
}

const TEST_REPOSITORY = 'orkestr-regression/monitored-repo';
const TEST_TOKEN = 'ghp_regression_token_that_is_only_used_against_the_stub';

/** Minimal GitHub Actions API stub covering the endpoints the poller calls. */
class GitHubStub {
  runCount = 0;
  jobsCount = 0;
  logCount = 0;
  userCount = 0;

  private mode: 'success' | 'forbidden' | 'unauthorized' | 'empty' = 'success';
  private lastToken: string | null = null;

  setMode(mode: 'success' | 'forbidden' | 'unauthorized' | 'empty'): void {
    this.mode = mode;
  }

  get lastAuthorization(): string | null {
    return this.lastToken;
  }

  private json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  async handle(url: string, init: RequestInit = {}): Promise<Response> {
    const path = new URL(url).pathname;
    const headers = (init.headers as Record<string, string> | undefined) || {};
    this.lastToken = headers.Authorization || headers.authorization || null;

    if (path === '/user') {
      this.userCount += 1;
      return this.json(
        { login: 'goforitmaddy-dot', id: 424242 },
        200,
        { 'x-oauth-scopes': 'repo, read:org' }
      );
    }

    if (path.endsWith('/actions/runs')) {
      this.runCount += 1;

      if (this.mode === 'forbidden') {
        return this.json(
          { message: 'Resource not accessible by personal access token' },
          403,
          { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '9999999999' }
        );
      }
      if (this.mode === 'unauthorized') {
        return this.json({ message: 'Bad credentials' }, 401);
      }
      if (this.mode === 'empty') {
        return this.json({ total_count: 0, workflow_runs: [] });
      }

      // A successful response uses the documented `workflow_runs` envelope.
      return this.json({
        total_count: 1,
        workflow_runs: [
          {
            id: 990011,
            name: 'CI Pipeline',
            node_id: 'run-node-1',
            head_branch: 'main',
            head_sha: 'abc123def456',
            path: '.github/workflows/ci.yml',
            run_number: 7,
            run_attempt: 1,
            event: 'push',
            status: 'completed',
            conclusion: 'failure',
            url: 'https://api.github.com/repos/orkestr-regression/monitored-repo/actions/runs/990011',
            html_url: 'https://github.com/orkestr-regression/monitored-repo/actions/runs/990011',
            created_at: '2026-10-23T09:00:00Z',
            updated_at: '2026-10-23T09:05:00Z',
            run_started_at: '2026-10-23T09:00:10Z',
            pull_requests: [],
          },
        ],
      });
    }

    if (path.endsWith('/jobs')) {
      this.jobsCount += 1;
      return this.json({
        total_count: 1,
        jobs: [
          {
            id: 550022,
            run_id: 990011,
            run_url:
              'https://api.github.com/repos/orkestr-regression/monitored-repo/actions/runs/990011',
            node_id: 'job-node-1',
            head_sha: 'abc123def456',
            url: 'https://api.github.com/repos/orkestr-regression/monitored-repo/actions/jobs/550022',
            html_url:
              'https://github.com/orkestr-regression/monitored-repo/actions/runs/990011/job/550022',
            status: 'completed',
            conclusion: 'failure',
            started_at: '2026-10-23T09:00:20Z',
            completed_at: '2026-10-23T09:04:50Z',
            name: 'Build and Test',
            workflow_name: 'CI Pipeline',
            steps: [
              { name: 'Install dependencies', status: 'completed', conclusion: 'success', number: 1 },
              { name: 'Run tests', status: 'completed', conclusion: 'failure', number: 2 },
            ],
          },
        ],
      });
    }

    if (path.includes('/actions/jobs/') && path.endsWith('/logs')) {
      this.logCount += 1;
      return new Response(
        'npm test\nAssertionError: expected 200 but received 500\nProcess completed with exit code 1.',
        { status: 200 }
      );
    }

    return this.json({ message: `No stub for ${path}` }, 404);
  }
}

async function registerTestUser(baseUrl: string) {
  const email = `orkestr-github-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const response = await fetch(`${baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'GitHub Regression', email, password: 'correct-horse-battery' }),
  });
  assert.equal(response.status, 201);

  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'Signup must set a session cookie');

  const body = (await response.json()) as { data: { user: { id: string } } };
  return { cookie: setCookie.split(';')[0], userId: body.data.user.id, email };
}

async function testGitHubIntegration() {
  console.log('Testing GitHub integration (status endpoint, Poll Now, diagnostics)...');

  await resetMonitoringState();

  const app = createApp;
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}/api`;

  const stub = new GitHubStub();
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('http://localhost')) return realFetch(input as never, init);
    return stub.handle(url, init);
  }) as typeof fetch;

  let createdProjectId: string | null = null;
  let createdUserId: string | null = null;

  try {
    const { cookie, userId } = await registerTestUser(baseUrl);
    createdUserId = userId;
    const authHeaders = { Cookie: cookie };

    // 1. Before connecting, the account has no monitoring credential.
    const beforeConnect = await fetch(`${baseUrl}/health`, { headers: authHeaders });
    const beforeConnectBody = (await beforeConnect.json()) as GitHubHealthResponse;
    assert.equal(beforeConnectBody.github.userTokenConfigured, false);
    assert.equal(beforeConnectBody.github.source, 'none');
    assert.equal(beforeConnectBody.services.monitoring, 'unconfigured');
    console.log('✓ Header status starts as unconfigured before a token is connected.');

    // 2. Connecting a token verifies it against GitHub and stores it.
    const connectRes = await fetch(`${baseUrl}/github-connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ token: TEST_TOKEN }),
    });
    assert.equal(connectRes.status, 201);
    const connectBody = (await connectRes.json()) as {
      success: boolean;
      data: { connection: { status: string; accountLogin: string | null } };
    };
    assert.equal(connectBody.success, true);
    assert.equal(connectBody.data.connection.status, 'valid');
    assert.equal(connectBody.data.connection.accountLogin, 'goforitmaddy-dot');
    console.log('✓ POST /api/github-connections verifies the token and marks it valid.');

    // 3. The header's endpoint now reflects the personal connection.
    const afterConnect = await fetch(`${baseUrl}/health`, { headers: authHeaders });
    const afterConnectBody = (await afterConnect.json()) as GitHubHealthResponse;
    assert.equal(afterConnectBody.github.userTokenConfigured, true);
    assert.equal(afterConnectBody.github.connectionStatus, 'valid');
    assert.equal(afterConnectBody.github.accountLogin, 'goforitmaddy-dot');
    assert.equal(afterConnectBody.github.source, 'user');
    assert.equal(afterConnectBody.services.monitoring, 'configured');
    console.log('✓ GET /api/health reports the signed-in account\'s verified token (the header no longer says "No token").');

    // 4. The raw token is never exposed by the status endpoint.
    assert.ok(
      !JSON.stringify(afterConnectBody).includes(TEST_TOKEN),
      'The token must never be returned by the status endpoint'
    );
    console.log('✓ The status endpoint exposes only metadata, never the raw token.');

    // 5. An anonymous caller cannot see another account's connection.
    const anonymousHealth = await fetch(`${baseUrl}/health`);
    const anonymousBody = (await anonymousHealth.json()) as GitHubHealthResponse;
    assert.equal(anonymousBody.github.userTokenConfigured, false);
    assert.equal(anonymousBody.github.accountLogin, null);
    console.log('✓ An anonymous health check does not leak the connection.');

    // 6. Monitoring status is scoped to the account and reports the connection.
    const statusRes = await fetch(`${baseUrl}/monitoring/status`, { headers: authHeaders });
    assert.equal(statusRes.status, 200);
    const status = (await statusRes.json()) as MonitoringStatusResponse;
    assert.equal(status.credentialsConfigured, true);
    assert.equal(status.userConnections.valid, 1);
    assert.equal(status.userConnection?.status, 'valid');
    assert.equal(status.userConnection?.accountLogin, 'goforitmaddy-dot');
    console.log('✓ GET /api/monitoring/status reports the account\'s valid connection.');

    // 7. The repository selected in Projects is the polling target.
    const createRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        name: `github-regression-${Date.now()}`,
        repository: TEST_REPOSITORY,
        monitoringEnabled: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const project = (await createRes.json()) as { id: string; repository: string };
    createdProjectId = project.id;
    assert.equal(project.repository, TEST_REPOSITORY);
    console.log('✓ POST /api/projects links the repository selected in Projects.');

    // 8. Poll Now succeeds and inspects the selected repository with the saved token.
    const pollRes = await fetch(`${baseUrl}/monitoring/poll`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(pollRes.status, 200);
    const poll = (await pollRes.json()) as PollResponse;
    assert.equal(poll.success, true, `Expected a successful poll, got: ${poll.message}`);
    assert.ok(poll.data, 'A successful poll must include diagnostics');
    assert.ok(poll.data!.repositoriesChecked.includes(TEST_REPOSITORY));
    assert.equal(poll.data!.workflowRunsInspected, 1);
    assert.equal(poll.data!.failedRunsFound, 1);
    assert.equal(poll.data!.githubApiErrors.length, 0);
    assert.equal(stub.lastAuthorization, `Bearer ${TEST_TOKEN}`);
    console.log('✓ POST /api/monitoring/poll uses the saved, verified token against the selected repository.');

    // 9. The polling response was processed into a real Live Monitor incident.
    const incidentsRes = await fetch(`${baseUrl}/incidents`, { headers: authHeaders });
    const incidents = (await incidentsRes.json()) as IncidentResponse[];
    const incident = incidents.find((entry) => entry.repository_name === TEST_REPOSITORY);
    assert.ok(incident, 'The failed run must produce a real incident');
    assert.equal(incident.status, 'OPEN');
    assert.equal(incident.workflow_name, 'CI Pipeline');
    console.log('✓ The inspected failure was correlated into an OPEN Live Monitor incident.');

    // 10. Diagnostics are persisted and surfaced by the status endpoint.
    const statusAfterPoll = (await (
      await fetch(`${baseUrl}/monitoring/status`, { headers: authHeaders })
    ).json()) as MonitoringStatusResponse;
    const target = statusAfterPoll.targets.find((t) => t.repository === TEST_REPOSITORY);
    assert.ok(target);
    assert.equal(target.workflowRunsInspected, 1);
    assert.equal(target.failedRunsFound, 1);
    assert.equal(target.failuresDetected, 1);
    assert.equal(target.lastError, null);
    console.log('✓ GET /api/monitoring/status exposes runs inspected, failed runs found and last error.');

    // 11. A second poll does not double-count the already-seen failure.
    const secondPoll = (await (
      await fetch(`${baseUrl}/monitoring/poll`, { method: 'POST', headers: authHeaders })
    ).json()) as PollResponse;
    assert.equal(secondPoll.success, true);
    assert.equal(secondPoll.data!.workflowRunsInspected, 1);
    assert.equal(secondPoll.data!.failedRunsFound, 1);
    assert.equal(secondPoll.data!.failuresDetected, 0);
    console.log('✓ A repeated poll inspects the run again but does not duplicate the incident.');

    // 12. A real GitHub API error is reported as failure, never as success.
    stub.setMode('forbidden');
    const forbiddenPoll = await fetch(`${baseUrl}/monitoring/poll`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(forbiddenPoll.status, 200);
    const forbidden = (await forbiddenPoll.json()) as PollResponse;
    assert.equal(forbidden.success, false, 'A GitHub API error must not be reported as success');
    assert.ok(forbidden.data, 'Diagnostics must still be returned on failure');
    assert.equal(forbidden.data!.githubApiErrors.length, 1);
    assert.equal(forbidden.data!.githubApiErrors[0].status, 403);
    assert.match(forbidden.message, /error/i);
    assert.match(
      forbidden.data!.githubApiErrors[0].message,
      /permission|accessible|403/i,
      'The API error must be surfaced verbatim'
    );
    console.log('✓ A GitHub 403 is surfaced as a failed poll with the real API error.');

    // 13. The failure is persisted so the UI can show it.
    const statusAfterFailure = (await (
      await fetch(`${baseUrl}/monitoring/status`, { headers: authHeaders })
    ).json()) as MonitoringStatusResponse;
    const failedTarget = statusAfterFailure.targets.find((t) => t.repository === TEST_REPOSITORY);
    assert.ok(failedTarget?.lastError, 'The API error must be persisted on the target');
    console.log('✓ The persisted target records the GitHub API error.');

    // 14. No incidents were fabricated while polling failed.
    const incidentsAfterFailure = (await (
      await fetch(`${baseUrl}/incidents`, { headers: authHeaders })
    ).json()) as IncidentResponse[];
    const failedIncidents = incidentsAfterFailure.filter(
      (entry) => entry.repository_name === TEST_REPOSITORY
    );
    assert.equal(failedIncidents.length, 1, 'A failed poll must not create fake incidents');
    console.log('✓ A failed poll created no fabricated incidents.');

    // 15. Restoring GitHub clears the error on the next successful poll.
    stub.setMode('success');
    const recoveredPoll = (await (
      await fetch(`${baseUrl}/monitoring/poll`, { method: 'POST', headers: authHeaders })
    ).json()) as PollResponse;
    assert.equal(recoveredPoll.success, true);
    const statusAfterRecovery = (await (
      await fetch(`${baseUrl}/monitoring/status`, { headers: authHeaders })
    ).json()) as MonitoringStatusResponse;
    const recoveredTarget = statusAfterRecovery.targets.find(
      (t) => t.repository === TEST_REPOSITORY
    );
    assert.equal(recoveredTarget?.lastError, null);
    console.log('✓ A later successful poll clears the recorded API error.');

    console.log('\n🎉 GitHub Integration Regression Test PASSED!');
  } finally {
    globalThis.fetch = realFetch;
    if (createdProjectId) {
      await query(`DELETE FROM projects WHERE id = $1;`, [createdProjectId]).catch(() => undefined);
    }
    if (createdUserId) {
      await query(`DELETE FROM users WHERE id = $1;`, [createdUserId]).catch(() => undefined);
    }
    await resetMonitoringState().catch(() => undefined);
    server.close();
  }
}

testGitHubIntegration()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error('❌ GitHub integration test failed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
