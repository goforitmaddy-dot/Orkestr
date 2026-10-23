import { pool, query } from '../src/db';

const baseUrl = 'http://localhost:5001/api';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, error?: string) {
  if (condition) {
    console.log(`✓ PASS: ${name}`);
    results.push({ name, passed: true });
  } else {
    console.error(`✗ FAIL: ${name} ${error ? `(${error})` : ''}`);
    results.push({ name, passed: false, error });
  }
}

class SessionHelper {
  private cookies: string[] = [];

  extractCookies(res: Response) {
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const parts = setCookie.split(',').map((s) => s.trim());
      for (const part of parts) {
        const match = part.match(/^([^;=]+=[^;]+)/);
        if (match) {
          const cookiePair = match[1];
          const name = cookiePair.split('=')[0];
          this.cookies = this.cookies.filter((c) => !c.startsWith(`${name}=`));
          this.cookies.push(cookiePair);
        }
      }
    }
  }

  getCookieHeader(): string {
    return this.cookies.join('; ');
  }
}

async function runTests() {
  console.log('=====================================================');
  console.log('Testing Registered Member Enforcement & Username Auth');
  console.log('=====================================================');

  const cleanups: (() => Promise<void>)[] = [];

  try {
    const stamp = Date.now();
    const ownerEmail = `project_lead_${stamp}@orkestr.test`;
    const ownerUsername = `lead_${stamp}`;
    const memberEmail = `teammate_${stamp}@orkestr.test`;
    const memberUsername = `teammate_${stamp}`;

    const ownerSession = new SessionHelper();
    const memberSession = new SessionHelper();

    // 1. Register Owner with explicit username
    const regOwnerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Project Leader',
        email: ownerEmail,
        username: ownerUsername,
        password: 'Password123!',
      }),
    });
    ownerSession.extractCookies(regOwnerRes);
    const ownerData = (await regOwnerRes.json()) as { id: string; username: string };

    assert(
      '1. Owner registration succeeds with username',
      regOwnerRes.status === 201 && ownerData.username === ownerUsername
    );

    cleanups.push(async () => {
      await query('DELETE FROM users WHERE id = $1', [ownerData.id]);
    });

    // 2. Reject registration with duplicate username
    const dupUsernameRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Username Imposter',
        email: `imposter_${stamp}@orkestr.test`,
        username: ownerUsername, // same username
        password: 'Password123!',
      }),
    });
    assert(
      '2. Registration rejects duplicate username with 409 Conflict',
      dupUsernameRes.status === 409
    );

    // 3. Register second valid user (teammate)
    const regMemberRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Real Teammate',
        email: memberEmail,
        username: memberUsername,
        password: 'Password123!',
      }),
    });
    memberSession.extractCookies(regMemberRes);
    const memberData = (await regMemberRes.json()) as { id: string; username: string };

    assert(
      '3. Teammate registration succeeds with username',
      regMemberRes.status === 201 && memberData.username === memberUsername
    );

    cleanups.push(async () => {
      await query('DELETE FROM users WHERE id = $1', [memberData.id]);
    });

    // 4. Login using username instead of email
    const loginByUsernameRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailOrUsername: memberUsername,
        password: 'Password123!',
      }),
    });
    const loginByUsernameData = (await loginByUsernameRes.json()) as { email: string };
    assert(
      '4. Login succeeds with username instead of email',
      loginByUsernameRes.status === 200 && loginByUsernameData.email === memberEmail
    );

    // 5. Create a project by Owner
    const createProjectRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({
        name: `Test Project ${stamp}`,
        description: 'Testing registered member enforcement',
      }),
    });
    const projectData = (await createProjectRes.json()) as { id: string };
    assert('5. Project created successfully', createProjectRes.status === 201 && !!projectData.id);

    cleanups.push(async () => {
      await query('DELETE FROM projects WHERE id = $1', [projectData.id]);
    });

    // 6. Attempt to add UNREGISTERED email to project - MUST FAIL and NOT CREATE USER
    const unregisteredEmail = `ghost_user_${stamp}@nowhere.invalid`;
    const addUnregisteredRes = await fetch(`${baseUrl}/projects/${projectData.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({
        email: unregisteredEmail,
        role: 'MEMBER',
      }),
    });

    assert(
      '6a. Adding unregistered email to project is rejected with 404',
      addUnregisteredRes.status === 404
    );

    const ghostUserCheck = await query('SELECT id FROM users WHERE email = $1', [unregisteredEmail]);
    assert(
      '6b. Unregistered user stub was NOT created in users table',
      ghostUserCheck.rows.length === 0
    );

    // 7. Attempt to add non-existent username - MUST FAIL
    const addNonExistentUserRes = await fetch(`${baseUrl}/projects/${projectData.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({
        username: `nonexistent_${stamp}`,
        role: 'MEMBER',
      }),
    });
    assert(
      '7. Adding non-existent username to project is rejected with 404',
      addNonExistentUserRes.status === 404
    );

    // 8. Add registered user by username - MUST SUCCEED
    const addByUsernameRes = await fetch(`${baseUrl}/projects/${projectData.id}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({
        username: memberUsername,
        role: 'MEMBER',
      }),
    });
    assert(
      '8. Adding registered teammate by username succeeds with 201',
      addByUsernameRes.status === 201
    );

    // 9. Verify member list includes the newly added teammate with username
    const membersListRes = await fetch(`${baseUrl}/projects/${projectData.id}/members`, {
      headers: { Cookie: ownerSession.getCookieHeader() },
    });
    const membersList = (await membersListRes.json()) as Array<{ user_id: string; user_username?: string }>;
    const memberEntry = membersList.find((m) => m.user_id === memberData.id);
    assert(
      '9. Project members endpoint returns member with correct username',
      membersListRes.status === 200 && memberEntry?.user_username === memberUsername
    );
  } catch (err) {
    console.error('Test execution error:', err);
    assert('Test suite ran without error', false, String(err));
  } finally {
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (err) {
        console.warn('Cleanup error:', err);
      }
    }
  }

  console.log('\n=====================================================');
  console.log('Registered Member & Username Test Summary:');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passedCount} / ${results.length}`);
  console.log(`Failed: ${failedCount} / ${results.length}`);
  console.log('=====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().then(() => {
  pool.end();
});
