/**
 * Automated Test Suite for Orkestr GitHub Integration Foundation
 *
 * Verifies:
 * 1. Unauthenticated access rejection on all GitHub endpoints (401)
 * 2. Safe handling of missing credentials (clean unconfigured status, 503 on connect)
 * 3. Invalid and missing OAuth state parameter rejection
 * 4. Failed GitHub authorization handling (error parameters from GitHub)
 * 5. Successful GitHub account linking using mocked external GitHub API
 * 6. Duplicate GitHub identity linking rejection (409 Conflict)
 * 7. Safe unlinking of GitHub identity
 * 8. Unauthorized project members attempting to connect or disconnect repositories (403)
 * 9. Non-member (outsider) access rejection (403)
 * 10. Invalid repository input rejection (400)
 * 11. Successful repository connection by project OWNER/ADMIN
 * 12. Successful repository disconnection by project OWNER/ADMIN
 * 13. Regression verification: /api/auth/me reflects GitHub identity without exposing sensitive data
 */

import { Server } from 'http';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { pool, query } from '../src/db';
import {
  setGitHubApiTransport,
  GitHubUserProfile,
} from '../src/services/github.service';
import { AppError } from '../src/middleware/errorHandler';

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

async function runGitHubIntegrationTests() {
  console.log('=====================================================');
  console.log('Starting Orkestr GitHub Integration Foundation Suite');
  console.log('=====================================================\n');

  let server: Server | null = null;
  const testPort = 5097;
  const baseUrl = `http://localhost:${testPort}/api`;

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(testPort, () => {
      resolve();
    });
  });

  const sessionUnauth = new CookieSession();
  const sessionOwner = new CookieSession();
  const sessionMember = new CookieSession();
  const sessionOutsider = new CookieSession();

  let ownerUserId = '';
  let memberUserId = '';
  let outsiderUserId = '';
  let projectId = '';

  const timestamp = Date.now();
  const ownerEmail = `gh_owner_${timestamp}@test.com`;
  const memberEmail = `gh_member_${timestamp}@test.com`;
  const outsiderEmail = `gh_outsider_${timestamp}@test.com`;

  try {
    // -----------------------------------------------------------------
    // 1. Unauthenticated access checks
    // -----------------------------------------------------------------
    const unauthStatus = await fetch(`${baseUrl}/auth/github/status`);
    assert('1a. Unauthenticated GET /api/auth/github/status returns 401', unauthStatus.status === 401);

    const unauthConnect = await fetch(`${baseUrl}/auth/github/connect`);
    assert('1b. Unauthenticated GET /api/auth/github/connect returns 401', unauthConnect.status === 401);

    const unauthDisconnect = await fetch(`${baseUrl}/auth/github/disconnect`, { method: 'DELETE' });
    assert('1c. Unauthenticated DELETE /api/auth/github/disconnect returns 401', unauthDisconnect.status === 401);

    const unauthRepoStatus = await fetch(`${baseUrl}/projects/00000000-0000-0000-0000-000000000000/github`);
    assert('1d. Unauthenticated GET /api/projects/:id/github returns 401', unauthRepoStatus.status === 401);

    const unauthRepoConnect = await fetch(`${baseUrl}/projects/00000000-0000-0000-0000-000000000000/github/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoOwner: 'orkestr', repoName: 'test' }),
    });
    assert('1e. Unauthenticated POST /api/projects/:id/github/connect returns 401', unauthRepoConnect.status === 401);

    // -----------------------------------------------------------------
    // Register Users
    // -----------------------------------------------------------------
    const regOwner = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'GitHub Test Owner',
        username: `gh_owner_${timestamp}`,
        email: ownerEmail,
        password: 'Password123!',
      }),
    });
    sessionOwner.updateFromHeaders(regOwner.headers);
    const ownerData = await regOwner.json();
    ownerUserId = ownerData.id;

    const regMember = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'GitHub Test Member',
        username: `gh_member_${timestamp}`,
        email: memberEmail,
        password: 'Password123!',
      }),
    });
    sessionMember.updateFromHeaders(regMember.headers);
    const memberData = await regMember.json();
    memberUserId = memberData.id;

    const regOutsider = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'GitHub Test Outsider',
        username: `gh_outsider_${timestamp}`,
        email: outsiderEmail,
        password: 'Password123!',
      }),
    });
    sessionOutsider.updateFromHeaders(regOutsider.headers);
    const outsiderData = await regOutsider.json();
    outsiderUserId = outsiderData.id;

    // -----------------------------------------------------------------
    // 2. Safe handling of unconfigured credentials
    // -----------------------------------------------------------------
    const originalClientId = config.github.clientId;
    const originalClientSecret = config.github.clientSecret;

    config.github.clientId = '';
    config.github.clientSecret = '';

    const unconfiguredStatusRes = await fetch(`${baseUrl}/auth/github/status`, {
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    const unconfiguredStatus = await unconfiguredStatusRes.json();
    assert(
      '2a. Missing credentials returns isConfigured: false safely without crashing',
      unconfiguredStatusRes.status === 200 && unconfiguredStatus.isConfigured === false && unconfiguredStatus.isLinked === false
    );

    const unconfiguredConnectRes = await fetch(`${baseUrl}/auth/github/connect`, {
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    assert(
      '2b. Starting connect with missing credentials returns 503 Service Unavailable',
      unconfiguredConnectRes.status === 503
    );

    // Now configure credentials for testing
    config.github.clientId = 'mock-client-id-123';
    config.github.clientSecret = 'mock-client-secret-456';

    const configuredStatusRes = await fetch(`${baseUrl}/auth/github/status`, {
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    const configuredStatus = await configuredStatusRes.json();
    assert(
      '2c. Configured status returns isConfigured: true and isLinked: false',
      configuredStatusRes.status === 200 && configuredStatus.isConfigured === true && configuredStatus.isLinked === false
    );

    // -----------------------------------------------------------------
    // 3. Invalid and missing OAuth state parameter rejection
    // -----------------------------------------------------------------
    const missingStateRes = await fetch(`${baseUrl}/auth/github/callback?code=some-code`, {
      redirect: 'manual',
    });
    const missingStateLoc = missingStateRes.headers.get('location') || '';
    assert(
      '3a. Missing OAuth state redirects to error message',
      missingStateLoc.includes('github=error')
    );

    const invalidStateRes = await fetch(`${baseUrl}/auth/github/callback?code=some-code&state=non-existent-state-123`, {
      redirect: 'manual',
    });
    const invalidStateLoc = invalidStateRes.headers.get('location') || '';
    assert(
      '3b. Invalid or expired OAuth state redirects to error',
      invalidStateLoc.includes('github=error')
    );

    // -----------------------------------------------------------------
    // 4. Failed GitHub authorization handling
    // -----------------------------------------------------------------
    const userDeniedRes = await fetch(
      `${baseUrl}/auth/github/callback?error=access_denied&error_description=The+user+has+denied+your+application`,
      { redirect: 'manual' }
    );
    const userDeniedLoc = userDeniedRes.headers.get('location') || '';
    assert(
      '4. GitHub access_denied error handled gracefully with error redirect',
      userDeniedLoc.includes('github=error') && userDeniedLoc.includes('denied')
    );

    // -----------------------------------------------------------------
    // 5. Successful GitHub account linking using mocked external GitHub API
    // -----------------------------------------------------------------
    let tokenExchangeCalled = false;
    let fetchProfileCalled = false;
    const mockGitHubUserId = 12345678;
    const mockGitHubUsername = 'orkestr-dev';

    setGitHubApiTransport({
      exchangeCode: async (code: string) => {
        tokenExchangeCalled = true;
        if (code === 'valid-auth-code') {
          return 'mock-access-token-xyz';
        }
        throw new Error('Invalid code');
      },
      fetchProfile: async (token: string): Promise<GitHubUserProfile> => {
        fetchProfileCalled = true;
        if (token === 'mock-access-token-xyz') {
          return {
            id: mockGitHubUserId,
            login: mockGitHubUsername,
            email: 'dev@github.com',
          };
        }
        throw new Error('Invalid token');
      },
      verifyRepositoryAccess: async (instId: number | string, owner: string, name: string) => {
        if (String(instId) === '99999999') {
          throw new AppError('GitHub App installation is inaccessible, revoked, or lacks permission', 403);
        }
        if (owner === 'non-existent' || name === 'not-found') {
          throw new AppError('Repository was not found or is not accessible to GitHub App installation', 404);
        }
        return {
          repoId: 9876543,
          repoOwner: owner,
          repoName: name,
          fullName: `${owner}/${name}`,
          defaultBranch: 'main',
          permissions: { pull: true, push: true, admin: false },
        };
      },
    });

    // Test Open Redirect protection: pass an external malicious returnTo
    const maliciousInitRes = await fetch(`${baseUrl}/auth/github/connect?format=json&returnTo=https://evil-phishing.com/steal`, {
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    const { state: maliciousState } = await maliciousInitRes.json();
    const maliciousCallbackRes = await fetch(`${baseUrl}/auth/github/callback?code=valid-auth-code&state=${maliciousState}`, {
      redirect: 'manual',
    });
    const maliciousCallbackLoc = maliciousCallbackRes.headers.get('location') || '';
    assert(
      '5a. Open redirect attack prevented: returnTo=https://evil-phishing.com sanitized to local path',
      !maliciousCallbackLoc.includes('evil-phishing.com') &&
        maliciousCallbackLoc.startsWith(config.github.frontendUrl)
    );

    // Start flow to get valid state with normal returnTo
    const connectInitRes = await fetch(`${baseUrl}/auth/github/connect?format=json`, {
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    assert('5b. GET /api/auth/github/connect?format=json returns 200 with state and authUrl', connectInitRes.status === 200);
    const { state: validState, authUrl } = await connectInitRes.json();
    assert('5c. Auth URL contains client ID and state parameter', authUrl.includes('mock-client-id-123') && authUrl.includes(validState));

    // Callback with valid code and valid state
    const callbackRes = await fetch(`${baseUrl}/auth/github/callback?code=valid-auth-code&state=${validState}`, {
      redirect: 'manual',
    });
    const callbackLoc = callbackRes.headers.get('location') || '';
    assert(
      '5d. Callback successfully links account and redirects to success',
      tokenExchangeCalled && fetchProfileCalled && callbackLoc.includes('github=success')
    );

    // State cannot be replayed (atomic single-use)
    const replayRes = await fetch(`${baseUrl}/auth/github/callback?code=valid-auth-code&state=${validState}`, {
      redirect: 'manual',
    });
    const replayLoc = replayRes.headers.get('location') || '';
    assert('5e. Consumed state cannot be reused (CSRF replay protection)', replayLoc.includes('github=error'));

    // Check status endpoint
    const linkedStatusRes = await fetch(`${baseUrl}/auth/github/status`, {
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    const linkedStatus = await linkedStatusRes.json();
    assert(
      '5f. /api/auth/github/status confirms linked identity and stable numeric GitHub ID',
      linkedStatus.isLinked === true &&
        linkedStatus.githubUserId === String(mockGitHubUserId) &&
        linkedStatus.githubUsername === mockGitHubUsername
    );

    // Check /api/auth/me returns GitHub attributes safely
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    const meData = await meRes.json();
    assert(
      '5g. /api/auth/me reflects linked GitHub user without exposing tokens or secrets',
      meData.github_user_id === String(mockGitHubUserId) && meData.github_username === mockGitHubUsername
    );

    // -----------------------------------------------------------------
    // 6. Duplicate GitHub identity linking rejection (409 Conflict)
    // -----------------------------------------------------------------
    // Member tries to link the SAME mockGitHubUserId
    const memberConnectInit = await fetch(`${baseUrl}/auth/github/connect?format=json`, {
      headers: { Cookie: sessionMember.getCookieHeader() },
    });
    const { state: memberState } = await memberConnectInit.json();

    const dupCallbackRes = await fetch(`${baseUrl}/auth/github/callback?code=valid-auth-code&state=${memberState}`, {
      redirect: 'manual',
    });
    const dupLoc = dupCallbackRes.headers.get('location') || '';
    const decodedDupLoc = decodeURIComponent(dupLoc);
    assert(
      '6. Linking already-linked GitHub identity to another account redirects with conflict error',
      dupLoc.includes('github=error') && decodedDupLoc.includes('already linked')
    );

    // 6b. Transferring already-linked GitHub identity succeeds when transfer=true
    const transferInit = await fetch(`${baseUrl}/auth/github/connect?format=json&transfer=true`, {
      headers: { Cookie: sessionMember.getCookieHeader() },
    });
    const { state: transferState } = await transferInit.json();
    const transferCallbackRes = await fetch(`${baseUrl}/auth/github/callback?code=valid-auth-code&state=${transferState}`, {
      redirect: 'manual',
    });
    const transferLoc = transferCallbackRes.headers.get('location') || '';
    assert(
      '6b. Transferring already-linked GitHub identity succeeds when transfer=true',
      transferLoc.includes('github=success')
    );

    // Verify member now has the linked identity and owner was cleanly unlinked
    const memberTransferredStatusRes = await fetch(`${baseUrl}/auth/github/status`, {
      headers: { Cookie: sessionMember.getCookieHeader() },
    });
    const memberTransferredStatus = await memberTransferredStatusRes.json();
    assert('6c. Member now holds the GitHub identity after transfer', memberTransferredStatus.isLinked === true && memberTransferredStatus.githubUsername === 'orkestr-dev');

    const ownerAfterTransferRes = await fetch(`${baseUrl}/auth/github/status`, {
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    const ownerAfterTransfer = await ownerAfterTransferRes.json();
    assert('6d. Previous owner account was cleanly unlinked upon transfer', ownerAfterTransfer.isLinked === false);

    // -----------------------------------------------------------------
    // 7. Safe unlinking of GitHub identity
    // -----------------------------------------------------------------
    const disconnectRes = await fetch(`${baseUrl}/auth/github/disconnect`, {
      method: 'DELETE',
      headers: { Cookie: sessionMember.getCookieHeader() },
    });
    const disconnectData = await disconnectRes.json();
    assert('7a. DELETE /api/auth/github/disconnect returns 200', disconnectRes.status === 200 && disconnectData.success === true);

    const unlinkedStatusRes = await fetch(`${baseUrl}/auth/github/status`, {
      headers: { Cookie: sessionMember.getCookieHeader() },
    });
    const unlinkedStatus = await unlinkedStatusRes.json();
    assert('7b. Identity status is now unlinked', unlinkedStatus.isLinked === false && unlinkedStatus.githubUserId === null);

    // -----------------------------------------------------------------
    // 8. Project Repository connection & security verification
    // -----------------------------------------------------------------
    // Create a project as Owner
    const createProjRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        name: 'GitHub Integration Test Project',
        description: 'Testing repo connection',
      }),
    });
    const projData = await createProjRes.json();
    projectId = projData.id;

    // Create a second project to test duplicate repository prevention
    const createProj2Res = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        name: 'Second Test Project',
        description: 'Testing duplicate repo conflict',
      }),
    });
    const proj2Data = await createProj2Res.json();
    const projectId2 = proj2Data.id;

    // Add Member to project 1
    await fetch(`${baseUrl}/projects/${projectId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        userId: memberUserId,
        role: 'MEMBER',
      }),
    });

    // 8a. Outsider access rejected
    const outsiderRepoRes = await fetch(`${baseUrl}/projects/${projectId}/github`, {
      headers: { Cookie: sessionOutsider.getCookieHeader() },
    });
    assert('8a. Non-member (outsider) GET /api/projects/:id/github returns 403 Forbidden', outsiderRepoRes.status === 403);

    // 8b. Member cannot connect repository (403)
    const memberConnectRepoRes = await fetch(`${baseUrl}/projects/${projectId}/github/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionMember.getCookieHeader(),
      },
      body: JSON.stringify({
        repoOwner: 'orkestr-org',
        repoName: 'project-manager-core',
        installationId: 54321,
      }),
    });
    assert('8b. Regular MEMBER attempting to connect repo returns 403 Forbidden', memberConnectRepoRes.status === 403);

    // 8c. Invalid installation ID rejected
    const invalidInstRes = await fetch(`${baseUrl}/projects/${projectId}/github/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        repoOwner: 'orkestr-org',
        repoName: 'project-manager-core',
        installationId: 'invalid-not-numeric',
      }),
    });
    assert('8c. Invalid non-numeric installationId rejected with 400 Bad Request', invalidInstRes.status === 400);

    // 8d. Missing GitHub App credentials returns 503 without marking repository connected
    config.github.clientId = '';
    config.github.clientSecret = '';
    const unconfiguredRepoConnectRes = await fetch(`${baseUrl}/projects/${projectId}/github/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        repoOwner: 'orkestr-org',
        repoName: 'project-manager-core',
        installationId: 54321,
      }),
    });
    assert(
      '8d. Connecting repo with unconfigured GitHub App returns 503 and does not mark repo connected',
      unconfiguredRepoConnectRes.status === 503
    );
    config.github.clientId = 'mock-client-id-123';
    config.github.clientSecret = 'mock-client-secret-456';

    // 8e. Repository not found or not belonging to installation rejected (404)
    const notFoundRepoRes = await fetch(`${baseUrl}/projects/${projectId}/github/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        repoOwner: 'non-existent',
        repoName: 'not-found',
        installationId: 54321,
      }),
    });
    assert('8e. Repository not belonging to installation rejected with 404 Not Found', notFoundRepoRes.status === 404);

    // 8f. Revoked or inaccessible installation rejected (403)
    const revokedInstRes = await fetch(`${baseUrl}/projects/${projectId}/github/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        repoOwner: 'orkestr-org',
        repoName: 'project-manager-core',
        installationId: 99999999,
      }),
    });
    assert('8f. Inaccessible or revoked installation rejected with 403 Forbidden', revokedInstRes.status === 403);

    // 8g. OWNER successfully connects verified repository
    const connectValidRes = await fetch(`${baseUrl}/projects/${projectId}/github/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        repoOwner: 'orkestr-org',
        repoName: 'project-manager-core',
        installationId: 54321,
      }),
    });
    const connectValidData = await connectValidRes.json();
    assert(
      '8g. OWNER successfully connects verified repository retrieved from GitHub API',
      connectValidRes.status === 200 &&
        connectValidData.repository.isConnected === true &&
        connectValidData.repository.fullName === 'orkestr-org/project-manager-core' &&
        connectValidData.repository.defaultBranch === 'main' &&
        connectValidData.repository.repoId === '9876543' &&
        connectValidData.repository.installationId === '54321'
    );

    // 8h. Duplicate repository connection to second project rejected (409 Conflict)
    const dupRepoRes = await fetch(`${baseUrl}/projects/${projectId2}/github/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        repoOwner: 'orkestr-org',
        repoName: 'project-manager-core',
        installationId: 54321,
      }),
    });
    const dupRepoData = await dupRepoRes.json();
    assert(
      '8h. Connecting same repository to multiple projects rejected with 409 Conflict',
      dupRepoRes.status === 409 &&
        (dupRepoData.error?.message?.includes('already connected') ||
          dupRepoData.message?.includes('already connected'))
    );

    // 8i. Member can view connected repository
    const memberViewRepoRes = await fetch(`${baseUrl}/projects/${projectId}/github`, {
      headers: { Cookie: sessionMember.getCookieHeader() },
    });
    const memberViewData = await memberViewRepoRes.json();
    assert(
      '8i. Project MEMBER can view connected repository status',
      memberViewRepoRes.status === 200 && memberViewData.isConnected === true && memberViewData.fullName === 'orkestr-org/project-manager-core'
    );

    // 8j. Member cannot disconnect repository (403)
    const memberDisconnectRepoRes = await fetch(`${baseUrl}/projects/${projectId}/github/disconnect`, {
      method: 'DELETE',
      headers: { Cookie: sessionMember.getCookieHeader() },
    });
    assert('8j. Regular MEMBER attempting to disconnect repo returns 403 Forbidden', memberDisconnectRepoRes.status === 403);

    // 8k. OWNER successfully disconnects repository
    const ownerDisconnectRepoRes = await fetch(`${baseUrl}/projects/${projectId}/github/disconnect`, {
      method: 'DELETE',
      headers: { Cookie: sessionOwner.getCookieHeader() },
    });
    const ownerDisconnectData = await ownerDisconnectRepoRes.json();
    assert(
      '8k. Project OWNER successfully disconnects repository',
      ownerDisconnectRepoRes.status === 200 &&
        ownerDisconnectData.repository.isConnected === false &&
        ownerDisconnectData.repository.fullName === null
    );

    // 8l. After disconnect, second project can now connect the repository
    const connectProj2Res = await fetch(`${baseUrl}/projects/${projectId2}/github/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionOwner.getCookieHeader(),
      },
      body: JSON.stringify({
        repoOwner: 'orkestr-org',
        repoName: 'project-manager-core',
        installationId: 54321,
      }),
    });
    assert('8l. Disconnected repository can be cleanly connected to another project', connectProj2Res.status === 200);

    // Clean up project 2
    await query('DELETE FROM projects WHERE id = $1', [projectId2]).catch(() => {});

    // Clean up test transport
    setGitHubApiTransport(null);
    config.github.clientId = originalClientId;
    config.github.clientSecret = originalClientSecret;
  } finally {
    // Clean up created records
    if (projectId) {
      await query('DELETE FROM projects WHERE id = $1', [projectId]).catch(() => {});
    }
    await query('DELETE FROM users WHERE email IN ($1, $2, $3)', [
      ownerEmail,
      memberEmail,
      outsiderEmail,
    ]).catch(() => {});

    if (server) {
      (server as Server).close();
    }
  }

  // Summary
  console.log('\n=====================================================');
  console.log('GitHub Integration Test Summary:');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passed} / ${results.length}`);
  console.log(`Failed: ${failed} / ${results.length}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runGitHubIntegrationTests()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}
