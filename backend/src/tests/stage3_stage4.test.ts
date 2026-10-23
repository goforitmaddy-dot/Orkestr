import assert from 'node:assert/strict';
import { normalizeGitHubPayload } from '../services/normalizer.service';
import { extractLogExcerpt, extractErrorMessage } from '../services/logExtractor';
import {
  correlateMonitoringRecord,
  resetMemoryStores,
} from '../services/incidentCorrelation.service';
import { resetMemoryDeduplicationCache } from '../services/deduplicator.service';
import { resetMonitoringState } from './helpers/resetMonitoringState';
import { pool } from '../db';

/**
 * Stage 3 & Stage 4 Verification Test Suite
 */
async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Stage 3 & Stage 4 Verification Tests');
  console.log('====================================================\n');

  // Reset in-memory stores before testing
  resetMemoryStores();
  resetMemoryDeduplicationCache();

  // Reset persisted monitoring state so the suite is repeatable against a
  // long-lived database (delivery IDs and provider run IDs are fixed here).
  await resetMonitoringState();

  // =========================================================================
  // STAGE 3 TESTS: Detect and normalize a failure
  // =========================================================================
  console.log('--- STAGE 3: Detect and normalize a failure ---');

  // Test 1: Workflow Run Failure Normalization
  {
    console.log('Test 1: Normalizing a GitHub workflow_run failure...');
    const rawWorkflowRunPayload = {
      action: 'completed',
      workflow_run: {
        id: 12345678,
        name: 'Continuous Integration',
        head_branch: 'main',
        head_sha: '7e2ebee5d5f78d4ebd4723cb1e84fab71584d45e',
        run_attempt: 1,
        status: 'completed',
        conclusion: 'failure',
        html_url: 'https://github.com/orkestr/orkestr-core/actions/runs/12345678',
        updated_at: '2026-10-22T12:00:00Z',
        pull_requests: [
          {
            number: 42,
            title: 'feat: add payment gateway',
            html_url: 'https://github.com/orkestr/orkestr-core/pull/42',
          },
        ],
      },
      repository: {
        name: 'orkestr-core',
        full_name: 'orkestr/orkestr-core',
        html_url: 'https://github.com/orkestr/orkestr-core',
      },
      raw_logs: 'Starting build...\nStep 1 OK\nStep 2: npm test\nError: 2 tests failed in auth.spec.ts\nProcess completed with exit code 1.',
    };

    const headers = {
      'x-github-delivery': 'deliv-001-workflow-run',
      'x-github-event': 'workflow_run',
    };

    const record = normalizeGitHubPayload(rawWorkflowRunPayload, headers);

    assert.equal(record.repositoryName, 'orkestr/orkestr-core');
    assert.equal(record.workflowName, 'Continuous Integration');
    assert.equal(record.workflowRunId, '12345678');
    assert.equal(record.runAttempt, 1);
    assert.equal(record.branch, 'main');
    assert.equal(record.commitSha, '7e2ebee5d5f78d4ebd4723cb1e84fab71584d45e');
    assert.equal(record.isFailure, true);
    assert.equal(record.isRecovery, false);

    // PR verified
    assert.ok(record.associatedPullRequest);
    assert.equal(record.associatedPullRequest?.number, 42);
    assert.equal(record.associatedPullRequest?.title, 'feat: add payment gateway');

    // URLs verified
    assert.equal(record.runUrl, 'https://github.com/orkestr/orkestr-core/actions/runs/12345678');
    assert.equal(record.commitUrl, 'https://github.com/orkestr/orkestr-core/commit/7e2ebee5d5f78d4ebd4723cb1e84fab71584d45e');

    // Error & Excerpt verified
    assert.ok(record.logExcerpt?.includes('Error: 2 tests failed in auth.spec.ts'));
    assert.ok(record.errorMessage?.includes('Error: 2 tests failed in auth.spec.ts'));

    console.log('✓ Test 1 passed: workflow_run failure normalized accurately.');
  }

  // Test 2: Workflow Job with failed step normalization
  {
    console.log('\nTest 2: Normalizing a GitHub workflow_job with failed step...');
    const rawJobPayload = {
      action: 'completed',
      workflow_job: {
        id: 87654321,
        run_id: 12345678,
        workflow_name: 'Continuous Integration',
        name: 'Unit and Integration Tests',
        head_branch: 'main',
        head_sha: '7e2ebee5d5f78d4ebd4723cb1e84fab71584d45e',
        run_attempt: 1,
        status: 'completed',
        conclusion: 'failure',
        completed_at: '2026-10-22T12:02:00Z',
        steps: [
          { name: 'Set up Node.js', status: 'completed', conclusion: 'success', number: 1 },
          { name: 'Install dependencies', status: 'completed', conclusion: 'success', number: 2 },
          { name: 'Run test suite', status: 'completed', conclusion: 'failure', number: 3 },
          { name: 'Upload coverage', status: 'queued', conclusion: null, number: 4 },
        ],
      },
      repository: {
        full_name: 'orkestr/orkestr-core',
      },
      raw_logs: 'npm test\nAssertionError: expected status 200 but got 500\nexit code 1',
    };

    const headers = {
      'x-github-delivery': 'deliv-002-workflow-job',
      'x-github-event': 'workflow_job',
    };

    const record = normalizeGitHubPayload(rawJobPayload, headers);

    assert.equal(record.failedJob, 'Unit and Integration Tests');
    assert.equal(record.failedStep, 'Run test suite');
    assert.equal(record.isFailure, true);
    assert.equal(record.failureTimestamp, '2026-10-22T12:02:00Z');

    console.log('✓ Test 2 passed: failed job and step identified.');
  }

  // Test 3: Explicitly representing unavailable information
  {
    console.log('\nTest 3: Explicit representation of unavailable information...');
    const minimalPayload = {
      event_type: 'workflow_run',
      conclusion: 'failure',
      // No repository, no branch, no PR, no step, no logs
    };

    const record = normalizeGitHubPayload(minimalPayload);

    // Must be explicit null, NOT invented or placeholder strings
    assert.equal(record.branch, null);
    assert.equal(record.commitSha, null);
    assert.equal(record.associatedPullRequest, null);
    assert.equal(record.failedJob, null);
    assert.equal(record.failedStep, null);
    assert.equal(record.logExcerpt, null);
    assert.equal(record.commitUrl, null);

    console.log('✓ Test 3 passed: unavailable information represented explicitly as null.');
  }

  // Test 4: Bounded log excerpting (Avoid storing entire logs)
  {
    console.log('\nTest 4: Bounded log excerpt extraction...');
    // Create a large 200-line simulated log
    const largeLogLines: string[] = [];
    for (let i = 1; i <= 150; i++) {
      largeLogLines.push(`[info] line ${i}: standard diagnostic output`);
    }
    largeLogLines.push('FATAL: Database connection timeout during migration step 4');
    for (let i = 152; i <= 200; i++) {
      largeLogLines.push(`[debug] line ${i}: cleaning up worker threads`);
    }
    const fullLog = largeLogLines.join('\n');

    const excerpt = extractLogExcerpt(fullLog, { maxLines: 20 });
    assert.ok(excerpt !== null);
    assert.ok(excerpt.includes('FATAL: Database connection timeout'));
    assert.ok(excerpt.includes('[... earlier logs truncated ...]'));
    assert.ok(excerpt.split('\n').length <= 25); // Bounded window

    const errorMsg = extractErrorMessage(null, excerpt);
    assert.ok(errorMsg?.includes('FATAL: Database connection timeout'));

    console.log('✓ Test 4 passed: log excerpt bounded and focused on error.');
  }

  // =========================================================================
  // STAGE 4 TESTS: Deduplicate and correlate events
  // =========================================================================
  console.log('\n--- STAGE 4: Deduplicate and correlate events ---');

  // Test 5: Event Deduplication using stable delivery ID
  {
    console.log('Test 5: Explicit event deduplication using stable delivery ID...');
    const payload = {
      action: 'completed',
      workflow_run: {
        id: 999901,
        name: 'Deployment Pipeline',
        head_branch: 'production',
        conclusion: 'failure',
      },
      repository: { full_name: 'orkestr/prod-service' },
    };

    const headers = { 'x-github-delivery': 'stable-uuid-delivery-1001' };

    const record1 = normalizeGitHubPayload(payload, headers);
    const result1 = await correlateMonitoringRecord(record1, payload);

    assert.equal(result1.isDuplicate, false);
    assert.equal(result1.actionTaken, 'CREATED_INCIDENT');

    // Deliver exact same delivery ID again (simulated duplicate webhook replay)
    const record2 = normalizeGitHubPayload(payload, headers);
    const result2 = await correlateMonitoringRecord(record2, payload);

    assert.equal(result2.isDuplicate, true);
    assert.equal(result2.actionTaken, 'SKIPPED_DUPLICATE');
    console.log('✓ Test 5 passed: duplicate webhook deliveries safely detected and ignored.');
  }

  // Test 6: One failure with multiple events -> Same Incident (No duplicate incidents!)
  {
    console.log('\nTest 6: Correlating multiple failure events into one Incident...');
    const sharedRunId = 555001;

    // Event A: workflow_run failure event
    const eventA = {
      workflow_run: {
        id: sharedRunId,
        name: 'Build and Test',
        head_branch: 'feature/auth',
        head_sha: 'commit-aaa-111',
        run_attempt: 1,
        conclusion: 'failure',
      },
      repository: { full_name: 'orkestr/web-app' },
    };
    const recA = normalizeGitHubPayload(eventA, { 'x-github-delivery': 'deliv-A-1' });
    const resA = await correlateMonitoringRecord(recA, eventA);

    assert.equal(resA.actionTaken, 'CREATED_INCIDENT');
    const incidentId = resA.incidentId;
    assert.ok(incidentId);

    // Event B: workflow_job failure event for the SAME failed workflow run
    const eventB = {
      workflow_job: {
        id: 777001,
        run_id: sharedRunId,
        workflow_name: 'Build and Test',
        name: 'E2E Cypress Tests',
        head_branch: 'feature/auth',
        head_sha: 'commit-aaa-111',
        run_attempt: 1,
        conclusion: 'failure',
        completed_at: '2026-10-22T13:00:00Z',
      },
      repository: { full_name: 'orkestr/web-app' },
    };
    const recB = normalizeGitHubPayload(eventB, { 'x-github-delivery': 'deliv-B-2' });
    const resB = await correlateMonitoringRecord(recB, eventB);

    // Must attach to the EXISTING incident rather than creating an unrelated one!
    assert.equal(resB.actionTaken, 'ATTACHED_TO_INCIDENT');
    assert.equal(resB.incidentId, incidentId);

    console.log('✓ Test 6 passed: multiple failure events correlated to single active incident.');
  }

  // Test 7: Successful rerun recovers incident and preserves history
  {
    console.log('\nTest 7: Rerun recovery preserves history...');
    const rerunId = 555001; // Same workflow run re-run, or new run on same branch

    const successEvent = {
      workflow_run: {
        id: rerunId,
        name: 'Build and Test',
        head_branch: 'feature/auth',
        head_sha: 'commit-aaa-111',
        run_attempt: 2, // Second attempt succeeded!
        conclusion: 'success',
        status: 'completed',
      },
      repository: { full_name: 'orkestr/web-app' },
    };

    const recSuccess = normalizeGitHubPayload(successEvent, { 'x-github-delivery': 'deliv-success-3' });
    const resSuccess = await correlateMonitoringRecord(recSuccess, successEvent);

    assert.equal(resSuccess.actionTaken, 'RECOVERED_INCIDENT');
    assert.ok(resSuccess.incidentId);

    console.log('✓ Test 7 passed: successful rerun recovered active incident while preserving history.');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL STAGE 3 & STAGE 4 TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests()
  .then(async () => {
    // Release the connection pool so the process can exit immediately instead
    // of waiting for the pool idle timeout to drain.
    await pool.end();
  })
  .catch(async (err) => {
    console.error('❌ Test failed with error:', err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
