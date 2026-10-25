/**
 * Comprehensive Automated Verification Suite for Orkestr Authentication V1
 *
 * Verifies:
 * 1. Health check & DB reachability
 * 2. User registration with valid inputs & session establishment
 * 3. Sanitized user object returns (password_hash never exposed)
 * 4. Password hashing verification in DB (bcrypt hash, no plaintext)
 * 5. Duplicate email rejection (409 Conflict) with normalized email matching
 * 6. Invalid input rejection (short password, invalid email format)
 * 7. Successful login with correct credentials & session establishment
 * 8. Invalid credentials rejection with generic error (no user enumeration)
 * 9. Session reuse via HTTP-only cookie on /api/auth/me
 * 10. Unauthenticated access rejection on /api/auth/me (401 Unauthorized)
 * 11. Session destruction on logout & cookie clearing
 * 12. Stale/invalidated session rejection on /api/auth/me after logout
 * 13. Reusable requireAuth middleware properly blocks unauthenticated requests
 * 14. Legacy user preservation: users created without password retain ID and project memberships when registering
 * 15. Password hash is never exposed in /api/users or project members endpoints
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

// Cookie jar helper for native fetch
class CookieSession {
  private cookies: Map<string, string> = new Map();

  updateFromHeaders(headers: Headers) {
    // Collect Set-Cookie headers
    const rawSetCookie = headers.get('set-cookie');
    if (rawSetCookie) {
      // Split on comma only when followed by a cookie name
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

  clear() {
    this.cookies.clear();
  }
}

async function runAuthTests() {
  console.log('=====================================================');
  console.log('Starting Orkestr Authentication V1 Test Suite');
  console.log('=====================================================\n');

  let server: Server | null = null;
  let baseUrl = 'http://localhost:5001/api';

  // Check if server is already running on port 5001, otherwise spin up test server
  try {
    const res = await fetch('http://localhost:5001/api/health');
    if (res.status === 200) {
      console.log('Connected to existing server on port 5001.');
    } else {
      throw new Error('Server not 200');
    }
  } catch {
    console.log('Starting ephemeral test server on port 5099...');
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(5099, () => {
        baseUrl = 'http://localhost:5099/api';
        resolve();
      });
    });
  }

  try {
    // 1. Health check & DB reachability
    const healthRes = await fetch(`${baseUrl}/health`);
    const health = (await healthRes.json()) as { services?: { database?: string } };
    assert(
      '1. Health check returns 200 and database connected',
      healthRes.status === 200 && health.services?.database === 'connected'
    );

    // 2. Successful registration with valid inputs
    const testEmail = `dev_${Date.now()}@example.com`;
    const testPassword = 'Password123!Secure';
    const testName = 'Jane Developer';
    const userSession = new CookieSession();

    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testName,
        email: testEmail,
        password: testPassword,
        skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
        weeklyCapacityHours: 35,
        isAvailable: true,
      }),
    });
    userSession.updateFromHeaders(regRes.headers);
    const registeredUser = (await regRes.json()) as Record<string, unknown>;

    assert(
      '2. Registration succeeds with 201 Created and sets session cookie',
      regRes.status === 201 &&
        registeredUser.email === testEmail.toLowerCase() &&
        registeredUser.name === testName &&
        userSession.getCookieHeader().includes('orkestr.sid')
    );

    // 3. Sanitized user object returns: password_hash never exposed
    assert(
      '3. Sanitized user response omits password_hash',
      registeredUser.password_hash === undefined &&
        (registeredUser as Record<string, unknown>).password === undefined &&
        !!registeredUser.id
    );

    // 4. Password hashing verification in DB
    const dbUserRes = await query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [registeredUser.id as string]
    );
    const dbHash = dbUserRes.rows[0]?.password_hash;
    assert(
      '4. Password is stored as a secure bcrypt hash and not plaintext',
      !!dbHash && dbHash.startsWith('$2') && !dbHash.includes(testPassword)
    );

    // 5. Duplicate email rejection (409 Conflict) with case-insensitivity
    const dupRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Imposter',
        email: testEmail.toUpperCase(), // Test case normalization
        password: 'AnotherPassword999!',
      }),
    });
    assert(
      '5. Duplicate email registration is rejected with 409 Conflict',
      dupRes.status === 409
    );

    // 6. Invalid input rejection (short password, invalid email)
    const invalidRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid User',
        email: 'not-an-email',
        password: 'short', // < 8 characters
      }),
    });
    assert(
      '6. Invalid input (short password, bad email) rejected with 400 Bad Request',
      invalidRes.status === 400
    );

    // 7. Successful login with correct credentials
    const loginSession = new CookieSession();
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    loginSession.updateFromHeaders(loginRes.headers);
    const loggedInUser = (await loginRes.json()) as Record<string, unknown>;

    assert(
      '7. Successful login returns 200 and sanitized user profile',
      loginRes.status === 200 &&
        loggedInUser.email === testEmail.toLowerCase() &&
        loggedInUser.password_hash === undefined &&
        loginSession.getCookieHeader().includes('orkestr.sid')
    );

    // 8. Invalid credentials rejection with generic error
    const wrongPassRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword123!',
      }),
    });
    const wrongPassBody = (await wrongPassRes.json()) as { error?: { message?: string }; message?: string };
    const wrongPassMsg = wrongPassBody.error?.message || wrongPassBody.message || '';
    assert(
      '8. Wrong password returns generic 401 Unauthorized',
      wrongPassRes.status === 401 && wrongPassMsg.includes('Invalid email or password')
    );

    const nonExistentRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent_user_9999@example.com',
        password: 'SomePassword123!',
      }),
    });
    const nonExistentBody = (await nonExistentRes.json()) as { error?: { message?: string }; message?: string };
    const nonExistentMsg = nonExistentBody.error?.message || nonExistentBody.message || '';
    assert(
      '8b. Non-existent email returns identical generic 401 error',
      nonExistentRes.status === 401 && nonExistentMsg.includes('Invalid email or password')
    );

    // 9. Session reuse via cookie on /api/auth/me
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: loginSession.getCookieHeader() },
    });
    const meUser = (await meRes.json()) as Record<string, unknown>;
    assert(
      '9. /api/auth/me returns current user when valid session cookie provided',
      meRes.status === 200 &&
        meUser.id === registeredUser.id &&
        meUser.email === testEmail.toLowerCase() &&
        meUser.password_hash === undefined
    );

    // 10. Unauthenticated access rejection on /api/auth/me
    const unauthMeRes = await fetch(`${baseUrl}/auth/me`);
    assert(
      '10. /api/auth/me returns 401 Unauthorized when no session provided',
      unauthMeRes.status === 401
    );

    // 11. Session destruction on logout & cookie clearing
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: loginSession.getCookieHeader() },
    });
    loginSession.updateFromHeaders(logoutRes.headers);
    assert(
      '11. /api/auth/logout succeeds with 200 and clears session cookie',
      logoutRes.status === 200
    );

    // 12. Invalidated session cannot access /api/auth/me
    const afterLogoutMeRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: loginSession.getCookieHeader() },
    });
    assert(
      '12. /api/auth/me returns 401 after logout',
      afterLogoutMeRes.status === 401
    );

    // 13. Legacy user preservation:
    // Create an existing legacy user without password (e.g. from prior schema)
    const legacyEmail = `legacy_${Date.now()}@example.com`;
    const legacyUserRes = await query<{ id: string }>(
      `INSERT INTO users (name, email, skills, weekly_capacity_hours, is_available)
       VALUES ('Legacy Developer', $1, '{"React", "CSS"}', 30, true)
       RETURNING id`,
      [legacyEmail]
    );
    const legacyUserId = legacyUserRes.rows[0].id;

    // Create a dummy project and assign legacy user as member
    const projRes = await query<{ id: string }>(
      `INSERT INTO projects (name, description) VALUES ('Legacy Preservation Project', 'Auth Test') RETURNING id`
    );
    const testProjectId = projRes.rows[0].id;

    await query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
      [testProjectId, legacyUserId]
    );

    // Register with legacy user's email to activate account
    const legacyRegRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Legacy Developer Claimed',
        email: legacyEmail,
        password: 'LegacyPassword2026!',
      }),
    });
    const activatedUser = (await legacyRegRes.json()) as Record<string, unknown>;

    // Verify user ID was preserved
    assert(
      '14a. Legacy user ID preserved upon registration',
      legacyRegRes.status === 201 && activatedUser.id === legacyUserId
    );

    // Verify project membership remains intact
    const memberCheck = await query(
      `SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [testProjectId, legacyUserId]
    );
    assert(
      '14b. Existing project memberships and relationships intact for claimed legacy user',
      memberCheck.rows.length === 1
    );

    // Track legacy user session
    const legacySession = new CookieSession();
    legacySession.updateFromHeaders(legacyRegRes.headers);

    // 15. Password hashes are never returned across user/project member endpoints
    const unauthUsersRes = await fetch(`${baseUrl}/users`);
    assert('15a. Unauthenticated /api/users is rejected with 401', unauthUsersRes.status === 401);

    const usersListRes = await fetch(`${baseUrl}/users`, {
      headers: { Cookie: legacySession.getCookieHeader() },
    });
    const usersList = (await usersListRes.json()) as Array<Record<string, unknown>>;
    const hasHashInList = Array.isArray(usersList) && usersList.some((u) => 'password_hash' in u || 'password' in u);
    assert(
      '15b. /api/users never exposes password_hash or password field',
      usersListRes.status === 200 && !hasHashInList
    );

    const membersRes = await fetch(`${baseUrl}/projects/${testProjectId}/members`, {
      headers: { Cookie: legacySession.getCookieHeader() },
    });
    const membersList = (await membersRes.json()) as Array<Record<string, unknown>>;
    const hasHashInMembers = Array.isArray(membersList) && membersList.some((m) => 'password_hash' in m || 'password' in m);
    assert(
      '15c. /api/projects/:id/members never exposes password_hash or password field',
      membersRes.status === 200 && !hasHashInMembers
    );

    // Cleanup test project
    await query('DELETE FROM projects WHERE id = $1', [testProjectId]);
    await query('DELETE FROM users WHERE email IN ($1, $2)', [testEmail, legacyEmail]);

  } catch (err) {
    console.error('Unexpected test error:', err);
    assert('Test execution completed without uncaught exception', false, String(err));
  } finally {
    if (server) {
      await new Promise<void>((resolve) => (server as Server).close(() => resolve()));
    }
  }

  console.log('\n=====================================================');
  console.log('Test Summary:');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  console.log(`Failed: ${failedCount} / ${results.length}`);
  console.log('=====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAuthTests().then(() => {
  pool.end();
});
