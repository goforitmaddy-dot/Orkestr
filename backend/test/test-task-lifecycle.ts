import { Server } from 'http';
import { createApp } from '../src/app';
import { query } from '../src/db';
import {
  setGitHubApiTransport,
} from '../src/services/github.service';
import {
  setVerificationProvider,
  IVerificationProvider,
  MockVerificationProvider,
} from '../src/services/verification/verification.provider';
import * as taskService from '../src/services/task.service';
import {
  VerificationPromptInput,
  AiVerificationOutput,
} from '../src/services/verification/verification.types';

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

// Configurable mock provider for test outcomes
class ConfigurableMockProvider implements IVerificationProvider {
  public nextVerdict: 'SATISFIED' | 'UNMET' | 'PARTIALLY_SATISFIED' = 'SATISFIED';
  public shouldThrow: boolean = false;

  async verifyCodeChanges(input: VerificationPromptInput): Promise<AiVerificationOutput> {
    if (this.shouldThrow) {
      throw new Error('Gemini API 503: Service Unavailable');
    }

    if (this.nextVerdict === 'UNMET') {
      return {
        overallVerdict: 'UNMET',
        summary: 'Material missing requirements: acceptance criteria not implemented in code.',
        confidenceScore: 0.95,
        recommendation: 'Implement missing database schemas and route handlers.',
        requirementsCoverage: [
          {
            requirement: input.acceptanceCriteria[0] || 'Requirement 1',
            status: 'UNMET',
            explanation: 'No code changes found matching this requirement.',
            evidence: [],
            confidence: 0.95,
          },
        ],
        inspectedFiles: [
          {
            filePath: 'src/dummy.ts',
            changeType: 'modified',
            relevance: 'Irrelevant change',
            summary: 'Comments only',
          },
        ],
        gapsAndRisks: {
          missingRequirements: ['Route handler for lifecycle endpoints is completely missing.'],
          potentialRegressionsOrSecurity: [],
          areasRequiringTesting: ['All lifecycle endpoints'],
          limitations: [],
        },
      };
    }

    return {
      overallVerdict: 'SATISFIED',
      summary: 'All requirements verified against code changes.',
      confidenceScore: 0.98,
      recommendation: 'Ready for human approval.',
      requirementsCoverage: [
        {
          requirement: input.acceptanceCriteria[0] || 'Requirement 1',
          status: 'SATISFIED',
          explanation: 'Fully implemented in pull request code.',
          evidence: ['src/services/task.service.ts'],
          confidence: 0.98,
        },
      ],
      inspectedFiles: [
        {
          filePath: 'src/services/task.service.ts',
          changeType: 'modified',
          relevance: 'Core task status validation',
          summary: 'Enforces controlled task transitions.',
        },
      ],
      gapsAndRisks: {
        missingRequirements: [],
        potentialRegressionsOrSecurity: [],
        areasRequiringTesting: ['Edge-case status transitions'],
        limitations: [],
      },
    };
  }
}

async function runTaskLifecycleTests() {
  console.log('=====================================================');
  console.log('Starting Orkestr Task Lifecycle & Workflow Test Suite');
  console.log('=====================================================\n');

  let server: Server | null = null;
  let baseUrl = 'http://localhost:5001';

  try {
    const healthCheck = await fetch(`${baseUrl}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      const app = createApp();
      const testPort = 5003;
      baseUrl = `http://localhost:${testPort}`;
      await new Promise<void>((resolve) => {
        server = app.listen(testPort, () => resolve());
      });
      console.log(`Started dedicated test server on port ${testPort}`);
    } else {
      console.log('Connected to existing server on port 5001.');
    }

    // Set up mock provider
    const mockProvider = new ConfigurableMockProvider();
    setVerificationProvider(mockProvider);

    setGitHubApiTransport({
      fetchCommitChanges: async (owner, repo, sha) => ({
        identifier: sha,
        activityType: 'COMMIT',
        title: 'feat: implement lifecycle checks',
        url: `https://github.com/${owner}/${repo}/commit/${sha}`,
        files: [
          {
            filename: 'src/services/task.service.ts',
            status: 'modified',
            additions: 45,
            deletions: 2,
            changes: 47,
            patch: '@@ -1,5 +1,10 @@\n+export function validateTaskStatusTransition() {}',
          },
        ],
        stats: { totalFiles: 1, additions: 45, deletions: 2, totalChanges: 47 },
        limitations: [],
      }),
    });

    const rand = Math.floor(Math.random() * 1000000);
    const ownerEmail = `owner_lc_${rand}@orkestr.test`;
    const devEmail = `dev_lc_${rand}@orkestr.test`;
    const outsiderEmail = `outsider_lc_${rand}@orkestr.test`;
    const password = 'Password123!';

    const ownerSession = new CookieSession();
    const devSession = new CookieSession();
    const outsiderSession = new CookieSession();

    // Register Owner, Developer (member), Outsider
    const regOwner = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Project Owner', username: `owner_lc_${rand}`, email: ownerEmail, password }),
    });
    ownerSession.updateFromHeaders(regOwner.headers);

    const regDev = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Developer User', username: `dev_lc_${rand}`, email: devEmail, password }),
    });
    devSession.updateFromHeaders(regDev.headers);
    const devUser = await regDev.json();

    const regOutsider = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Outsider User', username: `outsider_lc_${rand}`, email: outsiderEmail, password }),
    });
    outsiderSession.updateFromHeaders(regOutsider.headers);

    // Create Project
    const projRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerSession.getCookieHeader() },
      body: JSON.stringify({ name: `Lifecycle Project ${rand}`, description: 'Testing task lifecycle' }),
    });
    const project = await projRes.json();

    // Add Developer as MEMBER
    await query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'MEMBER')`, [
      project.id,
      devUser.id,
    ]);

    // Connect mock GitHub repository to project
    await query(
      `UPDATE projects
       SET github_repo_id = $1,
           github_repo_owner = 'testowner',
           github_repo_name = 'testrepo',
           github_connection_status = 'CONNECTED',
           github_connected_at = NOW()
       WHERE id = $2`,
      [rand + 2000000, project.id]
    );

    // -------------------------------------------------------------------------
    // TEST 1: Task creation always starts at TODO
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Task Creation & Starting Work ---');
    const taskRes = await fetch(`${baseUrl}/api/projects/${project.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerSession.getCookieHeader() },
      body: JSON.stringify({
        title: 'Build Workflow Feature',
        description: 'Verify lifecycle state transitions',
        acceptanceCriteria: ['Enforce TODO -> IN_PROGRESS -> IN_REVIEW -> DONE'],
        assigneeId: devUser.id,
      }),
    });
    const task = await taskRes.json();

    assert('1a. Newly created task starts with status TODO', task.status === 'TODO');

    // -------------------------------------------------------------------------
    // TEST 2: Direct Bypass Attempts Are Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Direct Lifecycle Bypass Prevention ---');

    // Developer attempts to jump TODO -> DONE
    const devJumpDoneRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: devSession.getCookieHeader() },
      body: JSON.stringify({ status: 'DONE' }),
    });
    assert('2a. Developer cannot arbitrarily jump TODO -> DONE (403 Forbidden)', devJumpDoneRes.status === 403);

    // Developer attempts direct PATCH to IN_REVIEW without verification submission
    const devDirectInReviewRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: devSession.getCookieHeader() },
      body: JSON.stringify({ status: 'IN_REVIEW' }),
    });
    assert('2b. Direct PATCH to IN_REVIEW rejected (400 Bad Request, must use verification)', devDirectInReviewRes.status === 400);

    // Developer attempts to set CHANGES_REQUESTED directly
    const devChangesReqRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: devSession.getCookieHeader() },
      body: JSON.stringify({ status: 'CHANGES_REQUESTED' }),
    });
    assert('2c. Developer cannot set CHANGES_REQUESTED directly (403 Forbidden)', devChangesReqRes.status === 403);

    // Outsider cannot update task
    const outsiderUpdateRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: outsiderSession.getCookieHeader() },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    assert('2d. Outsider cannot update task status (404 Not Found)', outsiderUpdateRes.status === 404);

    // -------------------------------------------------------------------------
    // TEST 3: Assigned developer starts working (TODO -> IN_PROGRESS)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Starting Work & Submission for Verification ---');

    const devStartRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: devSession.getCookieHeader() },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    const devStartTask = await devStartRes.json();
    assert('3a. Assigned developer can start task (TODO -> IN_PROGRESS)', devStartRes.status === 200 && devStartTask.status === 'IN_PROGRESS');

    // Developer attempts to mark DONE from IN_PROGRESS directly
    const devDoneFromProgressRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: devSession.getCookieHeader() },
      body: JSON.stringify({ status: 'DONE' }),
    });
    assert('3b. Developer cannot bypass verification from IN_PROGRESS -> DONE (403 Forbidden)', devDoneFromProgressRes.status === 403);

    // -------------------------------------------------------------------------
    // TEST 4: Verification with missing requirements -> CHANGES_REQUESTED
    // -------------------------------------------------------------------------
    console.log('\n--- 4. AI Verification Outcome: Unmet Requirements ---');

    // Link a commit activity
    const commitSha1 = 'a1b2c3d4e5f67890abcdef1234567890abcdef12';
    await query(
      `INSERT INTO task_github_activities (
         task_id, project_id, activity_type, github_identifier, title,
         body, github_url, github_created_at, created_at
       ) VALUES ($1, $2, 'COMMIT', $3, 'feat(ORK-${task.task_number}): partial changes', 'Diff content', 'https://github.com/testowner/testrepo/commit/${commitSha1}', NOW(), NOW())`,
      [task.id, project.id, commitSha1]
    );

    // Configure mock provider to return UNMET verdict
    mockProvider.nextVerdict = 'UNMET';

    // Developer submits task for verification
    const submitUnmetRes = await fetch(`${baseUrl}/api/tasks/${task.id}/verify`, {
      method: 'POST',
      headers: { Cookie: devSession.getCookieHeader() },
    });
    const submitUnmetJson = await submitUnmetRes.json();

    const taskAfterUnmet = await taskService.findTaskById(task.id);
    assert('4a. Verification runs successfully and records UNMET verdict',
      submitUnmetRes.status === 200 &&
      submitUnmetJson.verification?.overall_verdict === 'UNMET'
    );
    assert('4b. Verification with missing requirements automatically transitions task to CHANGES_REQUESTED',
      taskAfterUnmet?.status === 'CHANGES_REQUESTED'
    );
    assert('4c. Verification report preserves missing requirements list for developer',
      submitUnmetJson.verification?.gaps_and_risks?.missingRequirements?.length > 0
    );

    // -------------------------------------------------------------------------
    // TEST 5: Resume work & Resubmit
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Developer Resumes Work & Resubmits ---');

    // Developer clicks "Resume Work": CHANGES_REQUESTED -> IN_PROGRESS
    const devResumeRes = await fetch(`${baseUrl}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: devSession.getCookieHeader() },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    const devResumeTask = await devResumeRes.json();
    assert('5a. Developer can resume work on task (CHANGES_REQUESTED -> IN_PROGRESS)',
      devResumeRes.status === 200 && devResumeTask.status === 'IN_PROGRESS'
    );

    // Developer links new commit addressing changes
    const commitSha2 = 'b2c3d4e5f67890abcdef1234567890abcdef1234';
    await new Promise((r) => setTimeout(r, 10));
    await query(
      `INSERT INTO task_github_activities (
         task_id, project_id, activity_type, github_identifier, title,
         body, github_url, github_created_at, created_at
       ) VALUES ($1, $2, 'COMMIT', $3, 'fix(ORK-${task.task_number}): address review gaps', 'Full implementation', 'https://github.com/testowner/testrepo/commit/${commitSha2}', NOW(), NOW())`,
      [task.id, project.id, commitSha2]
    );

    // Configure mock provider to return SATISFIED verdict on resubmission
    mockProvider.nextVerdict = 'SATISFIED';

    // Developer resubmits for verification
    const resubmitRes = await fetch(`${baseUrl}/api/tasks/${task.id}/verify`, {
      method: 'POST',
      headers: { Cookie: devSession.getCookieHeader() },
    });
    const resubmitJson = await resubmitRes.json();
    const taskAfterSatisfied = await taskService.findTaskById(task.id);

    assert('5b. Resubmission succeeds with fresh verification report',
      resubmitRes.status === 200 &&
      resubmitJson.verification?.overall_verdict === 'SATISFIED'
    );
    assert('5c. Successful verification keeps task in IN_REVIEW (Ready for Approval, NOT marked DONE automatically)',
      taskAfterSatisfied?.status === 'IN_REVIEW'
    );

    // -------------------------------------------------------------------------
    // TEST 6: Reviewer Approval & Stale Guard
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Reviewer Authorization & Approval to DONE ---');

    // Regular member cannot approve
    const devApproveRes = await fetch(`${baseUrl}/api/tasks/${task.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: devSession.getCookieHeader() },
      body: JSON.stringify({ decision: 'APPROVED' }),
    });
    assert('6a. Ordinary member cannot approve task (403 Forbidden)', devApproveRes.status === 403);

    // New commit arrives -> marks report stale
    await new Promise((r) => setTimeout(r, 10));
    const commitSha3 = 'c3d4e5f67890abcdef1234567890abcdef123456';
    await query(
      `INSERT INTO task_github_activities (
         task_id, project_id, activity_type, github_identifier, title,
         body, github_url, github_created_at, created_at
       ) VALUES ($1, $2, 'COMMIT', $3, 'refactor(ORK-${task.task_number}): post-verify change', 'Post verify', 'https://github.com/testowner/testrepo/commit/${commitSha3}', NOW(), NOW())`,
      [task.id, project.id, commitSha3]
    );

    // Stale report cannot be approved silently
    const silentApprovalRes = await fetch(`${baseUrl}/api/tasks/${task.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerSession.getCookieHeader() },
      body: JSON.stringify({ decision: 'APPROVED' }),
    });
    assert('6b. Stale report cannot be approved without acknowledgement (409 Conflict)', silentApprovalRes.status === 409);

    // Owner approves acknowledging stale report
    const ackApprovalRes = await fetch(`${baseUrl}/api/tasks/${task.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerSession.getCookieHeader() },
      body: JSON.stringify({
        decision: 'APPROVED',
        feedback: 'Approved after inspecting latest refactor commit.',
        acknowledgeStale: true,
      }),
    });
    const ackApprovalJson = await ackApprovalRes.json();
    const taskAfterApproval = await taskService.findTaskById(task.id);

    assert('6c. Authorized project Owner review approval succeeds',
      ackApprovalRes.status === 200 &&
      ackApprovalJson.verification?.review_decision === 'APPROVED'
    );
    assert('6d. Review approval transitions task to DONE',
      taskAfterApproval?.status === 'DONE'
    );

    // -------------------------------------------------------------------------
    // TEST 7: Technical failure handling (Gemini / GitHub outage)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Technical Failure & Retry Recovery ---');

    // Create a new task in IN_PROGRESS
    const task2 = await taskService.createTask({
      projectId: project.id,
      title: 'Resilience Test Task',
      assigneeId: devUser.id,
    });
    await taskService.updateTask(task2.id, { status: 'IN_PROGRESS' });

    // Link a commit
    await query(
      `INSERT INTO task_github_activities (
         task_id, project_id, activity_type, github_identifier, title,
         body, github_url, github_created_at, created_at
       ) VALUES ($1, $2, 'COMMIT', 'sha999', 'feat: initial', 'Body', 'https://github.com/testowner/testrepo/commit/sha999', NOW(), NOW())`,
      [task2.id, project.id]
    );

    // Configure mock provider to throw network/technical error
    mockProvider.shouldThrow = true;

    const technicalFailRes = await fetch(`${baseUrl}/api/tasks/${task2.id}/verify`, {
      method: 'POST',
      headers: { Cookie: devSession.getCookieHeader() },
    });
    const task2AfterError = await taskService.findTaskById(task2.id);

    assert('7a. Technical outage does not label task as failed/unmet, returns 500 error',
      technicalFailRes.status === 500
    );
    assert('7b. Task is safely restored to IN_PROGRESS so developer can retry (not stuck in IN_REVIEW or DONE)',
      task2AfterError?.status === 'IN_PROGRESS'
    );

    // Cleanup test data
    await query(`DELETE FROM task_verifications WHERE project_id = $1`, [project.id]);
    await query(`DELETE FROM task_github_activities WHERE project_id = $1`, [project.id]);
    await query(`DELETE FROM tasks WHERE project_id = $1`, [project.id]);
    await query(`DELETE FROM project_members WHERE project_id = $1`, [project.id]);
    await query(`DELETE FROM projects WHERE id = $1`, [project.id]);
    await query(`DELETE FROM users WHERE email IN ($1, $2, $3)`, [ownerEmail, devEmail, outsiderEmail]);

    console.log('\n=====================================================');
    console.log('Task Lifecycle Test Summary:');
    const passed = results.filter((r) => r.passed).length;
    console.log(`Passed: ${passed} / ${results.length}`);
    console.log(`Failed: ${results.length - passed} / ${results.length}`);
    console.log('=====================================================\n');

    if (results.some((r) => !r.passed)) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error running task lifecycle test:', err);
    process.exit(1);
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }
}

runTaskLifecycleTests();
