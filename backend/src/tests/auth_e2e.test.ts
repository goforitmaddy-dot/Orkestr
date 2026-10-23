import assert from 'node:assert/strict';
import createApp from '../app';
import { Server } from 'node:http';
import { pool } from '../db';
import { query } from '../db';

/**
 * Accounts, sessions and per-user GitHub connections.
 */

interface AuthUserResponse {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
}

interface AuthResponse {
  success: boolean;
  data: { user: AuthUserResponse };
  message?: string;
}

interface ConnectionResponse {
  id: string;
  provider: string;
  accountLogin: string | null;
  tokenHint: string;
  scopes: string[];
  status: string;
  lastError: string | null;
}

const uniqueEmail = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;

const signup = async (baseUrl: string, email: string, password = 'correct-horse-battery') => {
  const response = await fetch(`${baseUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email, password }),
  });

  const setCookie = response.headers.get('set-cookie');
  return {
    response,
    body: (await response.json().catch(() => null)) as AuthResponse | null,
    cookie: setCookie ? setCookie.split(';')[0] : '',
  };
};

async function testAuthAndConnections() {
  console.log('Testing Accounts, Sessions and Per-User GitHub Connections...');

  const app = createApp;
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address() as { port: number };
  const baseUrl = `http://localhost:${address.port}/api`;

  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    // 1. An account can be created and receives a session cookie.
    const email = uniqueEmail('orkestr-auth');
    const signupResult = await signup(baseUrl, email);
    assert.equal(signupResult.response.status, 201);
    assert.equal(signupResult.body?.success, true);
    assert.ok(signupResult.cookie.includes('orkestr_session'));
    assert.equal(signupResult.body?.data.user.email, email);
    createdUserIds.push(signupResult.body!.data.user.id);
    console.log('✓ POST /api/auth/signup creates an account and sets a session cookie.');

    const authHeaders = { Cookie: signupResult.cookie };

    // 2. The session resolves the signed-in user.
    const meRes = await fetch(`${baseUrl}/auth/me`, { headers: authHeaders });
    assert.equal(meRes.status, 200);
    const me = (await meRes.json()) as AuthResponse;
    assert.equal(me.data.user.email, email);
    console.log('✓ GET /api/auth/me resolves the account behind the session cookie.');

    // 3. The session token is never stored in plain text.
    const tokenFromCookie = signupResult.cookie.split('=')[1];
    const stored = await query<{ token_hash: string }>(
      `SELECT token_hash FROM sessions WHERE user_id = $1;`,
      [createdUserIds[0]]
    );
    assert.equal(stored.rows.length, 1);
    assert.notEqual(stored.rows[0].token_hash, tokenFromCookie);
    assert.equal(stored.rows[0].token_hash.length, 64);
    console.log('✓ The session token is stored as a SHA-256 digest, never in plain text.');

    // 4. Duplicate emails are rejected.
    const duplicate = await signup(baseUrl, email);
    assert.equal(duplicate.response.status, 409);
    console.log('✓ Signing up twice with the same email returns 409.');

    // 5. The wrong password does not sign anyone in.
    const badLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    });
    assert.equal(badLogin.status, 401);
    console.log('✓ Logging in with the wrong password returns 401.');

    // 6. The correct password signs the account back in.
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'correct-horse-battery' }),
    });
    assert.equal(login.status, 200);
    const loginCookie = (login.headers.get('set-cookie') || '').split(';')[0];
    assert.ok(loginCookie);
    console.log('✓ POST /api/auth/login returns a new session for the correct password.');

    // 7. Signing out invalidates the session on the server.
    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: loginCookie },
    });
    assert.equal(logout.status, 200);
    const afterLogout = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: loginCookie } });
    assert.equal(afterLogout.status, 401);
    console.log('✓ POST /api/auth/logout destroys the session so the cookie stops working.');

    // 8. Protected endpoints reject anonymous callers.
    const anonymousProjects = await fetch(`${baseUrl}/projects`);
    assert.equal(anonymousProjects.status, 401);
    const anonymousConnections = await fetch(`${baseUrl}/github-connections`);
    assert.equal(anonymousConnections.status, 401);
    console.log('✓ Projects and GitHub connections require a session.');

    // 9. A GitHub connection is stored encrypted and only exposes a hint.
    const fakeToken = 'ghp_orkestr_invalid_token_for_tests';
    const createConnection = await fetch(`${baseUrl}/github-connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ token: fakeToken }),
    });
    const createBody = (await createConnection.json().catch(() => null)) as {
      data?: { connection?: ConnectionResponse };
    } | null;

    // The token is never echoed back, no matter whether GitHub accepted it.
    const createRaw = JSON.stringify(createBody);
    assert.ok(!createRaw.includes(fakeToken), 'The raw token must never be returned');
    console.log('✓ The raw token is never returned by the API.');

    const connection = createBody?.data?.connection;
    assert.ok(connection, 'The connection must be returned');

    const listConnections = await fetch(`${baseUrl}/github-connections`, { headers: authHeaders });
    assert.equal(listConnections.status, 200);
    const connections = (await listConnections.json()) as { data: ConnectionResponse[] };
    assert.equal(connections.data.length, 1);
    assert.equal(connections.data[0].id, connection.id);
    assert.equal(connections.data[0].tokenHint, '••••ests');
    assert.ok(!JSON.stringify(connections.data).includes(fakeToken));
    console.log('✓ The stored token is encrypted at rest and only a hint is exposed.');

    // 10. The token is encrypted in the database.
    const storedConnection = await query<{ token_encrypted: string; token_hint: string }>(
      `SELECT token_encrypted, token_hint FROM github_connections WHERE id = $1;`,
      [connection.id]
    );
    assert.equal(storedConnection.rows.length, 1);
    assert.ok(!storedConnection.rows[0].token_encrypted.includes(fakeToken));
    assert.ok(storedConnection.rows[0].token_encrypted.startsWith('v1:'));
    console.log('✓ The connection is written to the database as an AES-256-GCM payload.');

    // 11. A connection can be removed again.
    const deleteConnection = await fetch(`${baseUrl}/github-connections/${connection.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(deleteConnection.status, 200);
    const afterDelete = await fetch(`${baseUrl}/github-connections`, { headers: authHeaders });
    const remaining = (await afterDelete.json()) as { data: ConnectionResponse[] };
    assert.equal(remaining.data.length, 0);
    console.log('✓ DELETE /api/github-connections/:id removes the stored token.');

    // 12. Projects belong to the account that created them.
    const projectRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        name: `owned-project-${Date.now()}`,
        description: 'Ownership isolation check',
        repository: 'orkestr-e2e/owned-repo',
      }),
    });
    assert.equal(projectRes.status, 201);
    const project = (await projectRes.json()) as { id: string };
    createdProjectIds.push(project.id);

    const ownerRow = await query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1;`,
      [project.id]
    );
    assert.equal(ownerRow.rows[0].owner_id, createdUserIds[0]);
    console.log('✓ A new project is owned by the account that created it.');

    // 13. Another account cannot see or change that project.
    const other = await signup(baseUrl, uniqueEmail('orkestr-other'));
    createdUserIds.push(other.body!.data.user.id);
    const otherHeaders = { Cookie: other.cookie };

    const otherList = await fetch(`${baseUrl}/projects`, { headers: otherHeaders });
    const otherProjects = (await otherList.json()) as Array<{ id: string }>;
    assert.ok(!otherProjects.some((p) => p.id === project.id));
    console.log('✓ Projects are isolated per account.');

    const otherGet = await fetch(`${baseUrl}/projects/${project.id}`, { headers: otherHeaders });
    assert.equal(otherGet.status, 404);
    console.log('✓ Another account cannot open the project (404).');

    const otherUpdate = await fetch(`${baseUrl}/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...otherHeaders },
      body: JSON.stringify({ name: 'hijacked' }),
    });
    assert.equal(otherUpdate.status, 404);
    console.log('✓ Another account cannot modify the project (404).');

    // 14. The owner still sees it.
    const ownerList = await fetch(`${baseUrl}/projects`, { headers: authHeaders });
    const ownerProjects = (await ownerList.json()) as Array<{ id: string }>;
    assert.ok(ownerProjects.some((p) => p.id === project.id));
    console.log('✓ The owner still sees their own project.');

    console.log('\n🎉 Auth & GitHub Connection Test PASSED!');
  } finally {
    if (createdProjectIds.length > 0) {
      await query(`DELETE FROM projects WHERE id = ANY($1::UUID[]);`, [
        createdProjectIds.filter(Boolean),
      ]).catch(() => undefined);
    }
    if (createdUserIds.length > 0) {
      await query(`DELETE FROM users WHERE id = ANY($1::UUID[]);`, [createdUserIds]).catch(
        () => undefined
      );
    }
    server.close();
  }
}

testAuthAndConnections()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error('❌ Auth test failed:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
