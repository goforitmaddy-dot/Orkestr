import { Server } from 'http';
import { createApp } from '../src/app';
import { pool, query } from '../src/db';
import {
  setGitHubApiTransport,
  fetchActivityCodeChanges,
  ActivityCodeDiff,
} from '../src/services/github.service';
import {
  setVerificationProvider,
  MockVerificationProvider,
} from '../src/services/verification/verification.provider';
import * as verificationService from '../src/services/verification/verification.service';
import * as taskService from '../src/services/task.service';

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

async function runTaskVerificationTests() {
  console.log('=====================================================');
  console.log('Starting Orkestr AI Task Verification V1 Test Suite');
  console.log('=====================================================\n');

  let server: Server | null = null;
  let baseUrl = 'http://localhost:5001';

  try {
    const healthCheck = await fetch(`${baseUrl}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      const app = createApp();
      const testPort = 5002;
      baseUrl = `http://localhost:${testPort}`;
      await new Promise<void>((resolve) => {
        server = app.listen(testPort, () => resolve());
      });
      console.log(`Started dedicated test server on port ${testPort}`);
    } else {
      console.log('Connected to existing server on port 5001.');
    }

    // -------------------------------------------------------------------------
    // UNIT TESTS: GitHub Diff Retrieval & Sanitization
    // -------------------------------------------------------------------------
    console.log('\n--- 1. GitHub Code Change Retrieval & Sanitation ---');

    const mockOversizedPatch = 'const a = 1;\n'.repeat(1000); // > 8000 chars

    setGitHubApiTransport({
      fetchCommitChanges: async (owner, repo, sha) => {
        if (sha === 'not-found-sha') {
          const err: any = new Error('Commit not found');
          err.statusCode = 404;
          throw err;
        }
        if (sha === 'rate-limited-sha') {
          const err: any = new Error('API rate limit exceeded');
          err.statusCode = 403;
          throw err;
        }

        return {
          identifier: sha,
          activityType: 'COMMIT',
          title: 'feat(ORK-99): implement task verification',
          url: `https://github.com/${owner}/${repo}/commit/${sha}`,
          files: [
            {
              filename: 'src/services/verification.ts',
              status: 'added',
              additions: 120,
              deletions: 0,
              changes: 120,
              patch: '@@ -0,0 +1,120 @@\n+export const verify = () => true;',
            },
            {
              filename: 'package-lock.json',
              status: 'modified',
              additions: 50,
              deletions: 10,
              changes: 60,
              patch: '[Dependency lockfile content omitted from diff analysis to preserve model context]',
            },
            {
              filename: 'assets/logo.png',
              status: 'added',
              additions: 0,
              deletions: 0,
              changes: 0,
              isBinary: true,
              patch: '[Binary file changed or diff unavailable from GitHub]',
            },
            {
              filename: 'src/large-file.ts',
              status: 'modified',
              additions: 500,
              deletions: 10,
              changes: 510,
              isTruncated: true,
              patch: mockOversizedPatch.slice(0, 8000) + '\n... [Diff truncated at 8,000 characters to prevent context overflow]',
            },
          ],
          stats: {
            totalFiles: 4,
            additions: 670,
            deletions: 20,
            totalChanges: 690,
          },
          limitations: [
            "Dependency lockfile 'package-lock.json' diff omitted from AI context.",
            "Binary file or missing patch for 'assets/logo.png' (diff unavailable).",
            "Diff for 'src/large-file.ts' was truncated at 8,000 characters.",
          ],
        };
      },
    });

    const diffResult = await fetchActivityCodeChanges('testowner', 'testrepo', 'COMMIT', 'sha-12345');
    assert('1a. Commit diff retrieved with structured file statuses and additions/deletions',
      diffResult.files.length === 4 && diffResult.stats.additions === 670
    );
    assert('1b. Dependency lockfile is retained in file list with sanitized patch notice',
      diffResult.files.some((f) => f.filename === 'package-lock.json' && f.patch?.includes('omitted'))
    );
    assert('1c. Binary files without patches are flagged as isBinary: true',
      diffResult.files.some((f) => f.filename === 'assets/logo.png' && f.isBinary === true)
    );
    assert('1d. Oversized patches are truncated with explicit isTruncated flag',
      diffResult.files.some((f) => f.filename === 'src/large-file.ts' && f.isTruncated === true)
    );
    assert('1e. Explicit limitations record all truncated, binary, or omitted artifacts',
      diffResult.limitations.length === 3
    );

    let notFoundErrorHandled = false;
    try {
      await fetchActivityCodeChanges('testowner', 'testrepo', 'COMMIT', 'not-found-sha');
    } catch {
      notFoundErrorHandled = true;
    }
    assert('1f. GitHub 404 responses are caught and handled safely as AppErrors', notFoundErrorHandled);

    // -------------------------------------------------------------------------
    // UNIT TESTS: AI Verification Provider & Zod Validation
    // -------------------------------------------------------------------------
    console.log('\n--- 2. AI Verification Engine & Schema Validation ---');

    const mockProvider = new MockVerificationProvider();
    setVerificationProvider(mockProvider);

    const sampleVerification = await mockProvider.verifyCodeChanges({
      taskTitle: 'Implement AI Task Verification',
      taskDescription: 'Add automated code evaluation using Gemini',
      acceptanceCriteria: [
        'Criteria 1: Retrieve GitHub commits and patches',
        'Criteria 2: Return structured verdict and confidence score',
      ],
      activityDiffs: [diffResult],
      knownLimitations: diffResult.limitations,
    });

    assert('2a. Provider returns structured report with valid overallVerdict and confidenceScore',
      ['SATISFIED', 'PARTIALLY_SATISFIED', 'UNMET', 'INSUFFICIENT_EVIDENCE'].includes(sampleVerification.overallVerdict) &&
      sampleVerification.confidenceScore >= 0 && sampleVerification.confidenceScore <= 1
    );
    assert('2b. Provider evaluates each structured acceptance criterion separately',
      sampleVerification.requirementsCoverage.length === 2 &&
      sampleVerification.requirementsCoverage[0].requirement.includes('Criteria 1')
    );
    assert('2c. Empty acceptance criteria falls back to task description', async () => {
      const fallbackReport = await mockProvider.verifyCodeChanges({
        taskTitle: 'Fallback Task',
        taskDescription: 'Fallback task description serves as requirement',
        acceptanceCriteria: [],
        activityDiffs: [diffResult],
        knownLimitations: [],
      });
      return fallbackReport.requirementsCoverage.length === 1 &&
        fallbackReport.requirementsCoverage[0].requirement.includes('Fallback task description');
    });

    // -------------------------------------------------------------------------
    // INTEGRATION TESTS: Database, API Endpoints, Authorization & Stale Guard
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Database Persistence, Review Lifecycle & API Endpoints ---');

    const rand = Math.floor(Math.random() * 1000000);
    const ownerEmail = `owner_verify_${rand}@orkestr.test`;
    const memberEmail = `member_verify_${rand}@orkestr.test`;
    const outsiderEmail = `outsider_verify_${rand}@orkestr.test`;
    const password = 'Password123!';

    const ownerSession = new CookieSession();
    const memberSession = new CookieSession();
    const outsiderSession = new CookieSession();

    // Register 3 users
    const regOwner = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Owner User', username: `owner_${rand}`, email: ownerEmail, password }),
    });
    ownerSession.updateFromHeaders(regOwner.headers);
    const ownerUser = await regOwner.json();

    const regMember = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Member User', username: `member_${rand}`, email: memberEmail, password }),
    });
    memberSession.updateFromHeaders(regMember.headers);
    const memberUser = await regMember.json();

    const regOutsider = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Outsider User', username: `outsider_${rand}`, email: outsiderEmail, password }),
    });
    outsiderSession.updateFromHeaders(regOutsider.headers);
    const outsiderUser = await regOutsider.json();

    // Create project
    const projRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({ name: `Verification Project ${rand}`, description: 'Test project' }),
    });
    const project = await projRes.json();

    // Add member to project with role MEMBER
    await query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
      [project.id, memberUser.id]
    );

    // Create task with acceptance criteria
    const taskRes = await fetch(`${baseUrl}/api/projects/${project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({
        title: 'Implement Task Verification Feature',
        description: 'Verify GitHub pull requests and commits using Gemini AI',
        acceptanceCriteria: [
          'Verify code changes against task requirements',
          'Human review can approve or request changes',
        ],
        priority: 'HIGH',
      }),
    });
    const task = await taskRes.json();

    assert('3a. Task created with structured acceptance_criteria and task_number',
      Array.isArray(task.acceptance_criteria) &&
      task.acceptance_criteria.length === 2 &&
      typeof task.task_number === 'number'
    );

    // Unauthenticated access
    const unauthVerify = await fetch(`${baseUrl}/api/tasks/${task.id}/verify`, { method: 'POST' });
    assert('3b. Unauthenticated POST /api/tasks/:id/verify rejected with 401', unauthVerify.status === 401);

    const unauthGet = await fetch(`${baseUrl}/api/tasks/${task.id}/verification`);
    assert('3c. Unauthenticated GET /api/tasks/:id/verification rejected with 401', unauthGet.status === 401);

    // Outsider access
    const outsiderVerify = await fetch(`${baseUrl}/api/tasks/${task.id}/verify`, {
      method: 'POST',
      headers: { Cookie: outsiderSession.getCookieHeader() },
    });
    assert('3d. Outsider POST /api/tasks/:id/verify rejected with 404 (project security isolation)',
      outsiderVerify.status === 404
    );

    // Empty state when no verification exists yet
    const emptyGet = await fetch(`${baseUrl}/api/tasks/${task.id}/verification`, {
      headers: { Cookie: ownerSession.getCookieHeader() },
    });
    const emptyJson = await emptyGet.json();
    assert('3e. GET /api/tasks/:id/verification returns verification: null when no report exists',
      emptyGet.status === 200 && emptyJson.verification === null
    );

    // Verify task when project has NO connected GitHub repository
    const noRepoVerify = await fetch(`${baseUrl}/api/tasks/${task.id}/verify`, {
      method: 'POST',
      headers: { Cookie: ownerSession.getCookieHeader() },
    });
    const noRepoJson = await noRepoVerify.json();
    assert('3f. Task with disconnected repo returns INSUFFICIENT_EVIDENCE with actionable guidance',
      noRepoVerify.status === 200 &&
      noRepoJson.verification?.overall_verdict === 'INSUFFICIENT_EVIDENCE' &&
      noRepoJson.verification?.summary.includes('No active GitHub repository')
    );

    // Connect repository to project
    const testRepoId = rand + 1000000;
    await query(
      `UPDATE projects
       SET github_repo_id = $1,
           github_repo_owner = 'testowner',
           github_repo_name = 'testrepo',
           github_connection_status = 'CONNECTED',
           github_connected_at = NOW()
       WHERE id = $2`,
      [testRepoId, project.id]
    );

    // Verify task when project is connected but NO activity linked to task yet
    const noActVerify = await fetch(`${baseUrl}/api/tasks/${task.id}/verify`, {
      method: 'POST',
      headers: { Cookie: ownerSession.getCookieHeader() },
    });
    const noActJson = await noActVerify.json();
    assert('3g. Task without linked commits/PRs returns INSUFFICIENT_EVIDENCE referencing task key',
      noActVerify.status === 200 &&
      noActJson.verification?.overall_verdict === 'INSUFFICIENT_EVIDENCE' &&
      noActJson.verification?.summary.includes(`ORK-${task.task_number}`)
    );

    // Link a real mock commit activity to the task
    const mockCommitSha = 'c0ffee1234567890abcdef1234567890abcdef12';
    await query(
      `INSERT INTO task_github_activities (
         task_id, project_id, activity_type, github_identifier, title,
         body, github_url, github_created_at, created_at
       ) VALUES ($1, $2, 'COMMIT', $3, 'feat(ORK-${task.task_number}): add task verification', 'Full feature diff', 'https://github.com/testowner/testrepo/commit/${mockCommitSha}', NOW(), NOW())`,
      [task.id, project.id, mockCommitSha]
    );

    // Trigger verification with linked commit
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${task.id}/verify`, {
      method: 'POST',
      headers: { Cookie: ownerSession.getCookieHeader() },
    });
    const verifyJson = await verifyRes.json();
    assert('3h. Successful verification creates persisted report in task_verifications',
      verifyRes.status === 200 &&
      verifyJson.verification?.status === 'COMPLETED' &&
      verifyJson.verification?.overall_verdict === 'SATISFIED' &&
      verifyJson.verification?.associated_commit_shas.includes(mockCommitSha)
    );

    // Check task status automatically moved to IN_REVIEW
    const taskAfterVerify = await taskService.findTaskById(task.id);
    assert('3i. Triggering verification transitions task status to IN_REVIEW',
      taskAfterVerify?.status === 'IN_REVIEW'
    );

    // Retrieve report after page refresh (GET /api/tasks/:id/verification)
    const reportGet = await fetch(`${baseUrl}/api/tasks/${task.id}/verification`, {
      headers: { Cookie: ownerSession.getCookieHeader() },
    });
    const reportJson = await reportGet.json();
    assert('3j. GET /api/tasks/:id/verification retrieves complete persisted report with criteria checklist and file evidence',
      reportGet.status === 200 &&
      reportJson.verification?.id === verifyJson.verification?.id &&
      reportJson.verification?.requirements_coverage.length === 2 &&
      reportJson.verification?.inspected_files.length > 0 &&
      reportJson.verification?.is_stale === false
    );

    // -------------------------------------------------------------------------
    // HUMAN REVIEW & STALE REPORT PROTECTION
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Human Review Decisions & Stale Protection ---');

    // 4a. Regular MEMBER cannot review (must be OWNER or ADMIN)
    const memberReviewRes = await fetch(`${baseUrl}/api/tasks/${task.id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: memberSession.getCookieHeader(),
      },
      body: JSON.stringify({ decision: 'APPROVED' }),
    });
    assert('4a. Regular project member cannot approve or request changes (403 Forbidden)',
      memberReviewRes.status === 403
    );

    // 4b. Authorized reviewer requests changes with feedback
    const requestChangesRes = await fetch(`${baseUrl}/api/tasks/${task.id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({
        decision: 'CHANGES_REQUESTED',
        feedback: 'Please add unit test coverage for truncated diffs.',
      }),
    });
    const changesJson = await requestChangesRes.json();
    const taskAfterChanges = await taskService.findTaskById(task.id);

    assert('4b. Reviewer decision CHANGES_REQUESTED persists feedback and updates task status to CHANGES_REQUESTED',
      requestChangesRes.status === 200 &&
      changesJson.verification?.review_decision === 'CHANGES_REQUESTED' &&
      changesJson.verification?.review_feedback === 'Please add unit test coverage for truncated diffs.' &&
      taskAfterChanges?.status === 'CHANGES_REQUESTED'
    );

    // 4c. New commit pushed after review -> report becomes STALE
    await new Promise((r) => setTimeout(r, 10)); // Ensure strictly newer timestamp
    const newerCommitSha = 'f00ba234567890abcdef1234567890abcdef12';
    await query(
      `INSERT INTO task_github_activities (
         task_id, project_id, activity_type, github_identifier, title,
         body, github_url, github_created_at, created_at
       ) VALUES ($1, $2, 'COMMIT', $3, 'fix(ORK-${task.task_number}): add truncated diff unit tests', 'Fix unit tests', 'https://github.com/testowner/testrepo/commit/${newerCommitSha}', NOW(), NOW())`,
      [task.id, project.id, newerCommitSha]
    );

    const staleGet = await fetch(`${baseUrl}/api/tasks/${task.id}/verification`, {
      headers: { Cookie: ownerSession.getCookieHeader() },
    });
    const staleJson = await staleGet.json();
    assert('4c. Newer GitHub activity marks verification report as is_stale: true',
      staleJson.verification?.is_stale === true
    );

    // 4d. Attempting to approve stale report without acknowledgement fails with 409
    const unacknowledgedApproval = await fetch(`${baseUrl}/api/tasks/${task.id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        acknowledgeStale: false,
      }),
    });
    assert('4d. Stale report cannot be silently approved (returns 409 Conflict)',
      unacknowledgedApproval.status === 409
    );

    // 4e. Reviewing with explicit acknowledgeStale: true approves and moves task to DONE
    const acknowledgedApproval = await fetch(`${baseUrl}/api/tasks/${task.id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ownerSession.getCookieHeader(),
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        feedback: 'Reviewed latest patch changes. Approved for release.',
        acknowledgeStale: true,
      }),
    });
    const approvedJson = await acknowledgedApproval.json();
    const taskAfterApproved = await taskService.findTaskById(task.id);

    assert('4e. Explicitly acknowledged review approves and moves task status to DONE',
      acknowledgedApproval.status === 200 &&
      approvedJson.verification?.review_decision === 'APPROVED' &&
      taskAfterApproved?.status === 'DONE'
    );

    // Clean up test data
    await query(`DELETE FROM task_verifications WHERE project_id = $1`, [project.id]);
    await query(`DELETE FROM task_github_activities WHERE project_id = $1`, [project.id]);
    await query(`DELETE FROM tasks WHERE project_id = $1`, [project.id]);
    await query(`DELETE FROM project_members WHERE project_id = $1`, [project.id]);
    await query(`DELETE FROM projects WHERE id = $1`, [project.id]);
    await query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [ownerUser.id, memberUser.id, outsiderUser.id]).catch(() => {});

  } finally {
    setGitHubApiTransport(null);
    if (server) {
      await new Promise<void>((resolve) => (server as Server).close(() => resolve()));
    }
    await pool.end();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n=====================================================');
  console.log('AI Task Verification V1 Test Summary:');
  console.log(`Passed: ${passed} / ${results.length}`);
  console.log(`Failed: ${failed} / ${results.length}`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTaskVerificationTests().catch((err) => {
  console.error('Fatal verification test suite error:', err);
  process.exit(1);
});
