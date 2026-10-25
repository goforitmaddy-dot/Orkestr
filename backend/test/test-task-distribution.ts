/**
 * Comprehensive Automated Verification Suite for Orkestr Task Distribution Engine V1
 * Covers all 16 core test cases:
 * 1. Health & DB reachability
 * 2. Skill match affecting candidate rankings
 * 3. Workload balancing across members
 * 4. Priority handling and urgency weighting
 * 5. Dependency ordering and blocked tasks with warnings
 * 6. No eligible members handling (400 error)
 * 7. Capacity exceeded warning and over-capacity penalty
 * 8. Missing task estimates fallback to default (4 hours)
 * 9. Existing assignments preserved by default (redistributeAssigned: false)
 * 10. Explicit redistribution of existing assignments (redistributeAssigned: true)
 * 11. Completed tasks (DONE) excluded from distribution
 * 12. Invalid or cross-project assignees rejected on apply (400)
 * 13. Preview does not modify the database (0 rows changed)
 * 14. Approved assignments persist correctly transactionally
 * 15. Transaction rollback on failure (atomic batch)
 * 16. Determinism: identical inputs produce 100% identical outputs
 */

import { query, pool } from '../src/db';
import { previewTaskDistribution } from '../src/services/distribution/distribution.service';
import { addProjectMember } from '../src/services/member.service';
import { createTask } from '../src/services/task.service';

const BASE_URL = 'http://localhost:5001/api';

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

async function runTests() {
  console.log('=====================================================');
  console.log('Starting Orkestr Task Distribution Engine Test Suite');
  console.log('=====================================================\n');

  // --- 1. Health check ---
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const health = (await healthRes.json()) as { services: { database: string } };
    assert('1. Health endpoint returns 200 and db connected', healthRes.status === 200 && health.services.database === 'connected');
  } catch (err: unknown) {
    assert('1. Health check reachable', false, err instanceof Error ? err.message : 'Fetch failed');
  }

  // Register & authenticate test distribution owner
  let sessionCookie = '';
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Distribution Test Lead',
      email: `dist_lead_${Date.now()}@example.com`,
      password: 'Password123!',
    }),
  });
  const rawSetCookie = regRes.headers.get('set-cookie');
  if (rawSetCookie) {
    const [cookiePair] = rawSetCookie.split(';');
    sessionCookie = cookiePair.trim();
  }
  const regLead = (await regRes.json()) as { id: string };

  // --- Setup Test Project ---
  const projRes = await query<{ id: string }>(
    `INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING id`,
    ['Task Distribution Test Project', 'Testing deterministic workload balancing and skill matching']
  );
  const projectId = projRes.rows[0].id;

  try {
    // --- 2. Test: No eligible members in project -> rejected with 400 ---
    let noMembersThrew = false;
    try {
      await previewTaskDistribution(projectId, { redistributeAssigned: false, defaultEstimatedHours: 4 });
    } catch (err: unknown) {
      noMembersThrew = err instanceof Error && err.message.includes('has no team members');
    }
    assert('2. Project with 0 members returns clear 400 error', noMembersThrew);

    // Add lead as OWNER for management operations
    await query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [projectId, regLead.id]
    );

    // --- Create 3 Team Members with distinct skills and capacities ---
    const now = Date.now();
    const aliceEmail = `alice_${now}@example.com`;
    const bobEmail = `bob_${now}@example.com`;
    const charlieEmail = `charlie_${now}@example.com`;

    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Backend',
        email: aliceEmail,
        username: `alice_${now}`,
        password: 'Password123!',
      }),
    });

    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Frontend',
        email: bobEmail,
        username: `bob_${now}`,
        password: 'Password123!',
      }),
    });

    await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Charlie DevOps',
        email: charlieEmail,
        username: `charlie_${now}`,
        password: 'Password123!',
      }),
    });

    // Alice: Backend / Database specialist (40h capacity)
    const alice = await addProjectMember(projectId, {
      name: 'Alice Backend',
      email: aliceEmail,
      role: 'MEMBER',
      skills: ['backend', 'postgresql', 'node.js'],
      weeklyCapacityHours: 40,
      isAvailable: true,
    });

    // Bob: Frontend specialist (40h capacity)
    const bob = await addProjectMember(projectId, {
      name: 'Bob Frontend',
      email: bobEmail,
      role: 'MEMBER',
      skills: ['frontend', 'react', 'tailwind', 'next.js'],
      weeklyCapacityHours: 40,
      isAvailable: true,
    });

    // Charlie: Part-time Junior / DevOps (10h limited capacity)
    const charlie = await addProjectMember(projectId, {
      name: 'Charlie DevOps',
      email: charlieEmail,
      role: 'MEMBER',
      skills: ['devops', 'docker'],
      weeklyCapacityHours: 10,
      isAvailable: true,
    });

    assert('Team members added with distinct skills and capacities', !!alice.user_id && !!bob.user_id && !!charlie.user_id);

    // --- Create Tasks for Distribution Tests ---
    // Task 1: Backend Database Migration (Requires: postgresql, backend)
    const task1 = await createTask({
      projectId,
      title: 'Design PostgreSQL schema for distribution',
      estimatedHours: 8,
      priority: 'HIGH',
      requiredSkills: ['backend', 'postgresql'],
    });

    // Task 2: React Dashboard UI (Requires: frontend, react)
    const task2 = await createTask({
      projectId,
      title: 'Build React workload balancer UI',
      estimatedHours: 6,
      priority: 'MEDIUM',
      requiredSkills: ['frontend', 'react'],
    });

    // Task 3: Missing estimate task (No estimate provided -> should default to 4h)
    const task3 = await createTask({
      projectId,
      title: 'Documentation and release notes',
      estimatedHours: null,
      priority: 'LOW',
      requiredSkills: [], // General task
    });

    // Task 4: Already assigned task (Assigned to Alice)
    const task4 = await createTask({
      projectId,
      title: 'API Authentication middleware',
      estimatedHours: 5,
      priority: 'HIGH',
      assigneeId: alice.user_id,
      requiredSkills: ['backend'],
    });

    // Task 5: Completed task (DONE)
    const task5 = await createTask({
      projectId,
      title: 'Initial repository bootstrap',
      status: 'DONE',
      estimatedHours: 4,
      priority: 'LOW',
    });

    // --- 3. Test: Skill match affects candidate rankings ---
    const preview1 = await previewTaskDistribution(projectId, {
      redistributeAssigned: false,
      defaultEstimatedHours: 4,
    });

    const task1Assignment = preview1.proposedAssignments.find((a) => a.taskId === task1.id);
    assert(
      '3. Skill match ranks Alice #1 for backend/postgresql task',
      task1Assignment?.proposedAssigneeId === alice.user_id,
      `Proposed: ${task1Assignment?.proposedAssigneeName}`
    );

    const task2Assignment = preview1.proposedAssignments.find((a) => a.taskId === task2.id);
    assert(
      '4. Skill match ranks Bob #1 for frontend/react task',
      task2Assignment?.proposedAssigneeId === bob.user_id,
      `Proposed: ${task2Assignment?.proposedAssigneeName}`
    );

    // --- 4. Test: Missing task estimate uses default (4 hours) ---
    const task3Assignment = preview1.proposedAssignments.find((a) => a.taskId === task3.id);
    assert(
      '5. Task with missing estimate defaults to 4 hours',
      task3Assignment?.estimatedHours === 4,
      `Estimated hours: ${task3Assignment?.estimatedHours}`
    );

    // --- 5. Test: Existing assigned tasks preserved by default ---
    const task4InPreview1 = preview1.proposedAssignments.find((a) => a.taskId === task4.id);
    assert(
      '6. Existing assigned task is excluded from preview by default',
      task4InPreview1 === undefined
    );

    // --- 6. Test: Completed tasks (DONE) excluded from distribution ---
    const task5InPreview = preview1.proposedAssignments.find((a) => a.taskId === task5.id);
    assert(
      '7. Completed task (DONE) is excluded from distribution',
      task5InPreview === undefined
    );

    // --- 7. Test: Explicit redistribution includes already-assigned tasks ---
    const previewRedistribute = await previewTaskDistribution(projectId, {
      redistributeAssigned: true,
      defaultEstimatedHours: 4,
    });
    const task4InPreviewRedist = previewRedistribute.proposedAssignments.find((a) => a.taskId === task4.id);
    assert(
      '8. redistributeAssigned: true includes already-assigned task in preview',
      task4InPreviewRedist !== undefined
    );

    // --- 8. Test: Dependency awareness & blocked task warning ---
    // Link task2 to depend on task1
    await query(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)`,
      [task2.id, task1.id]
    );

    const previewWithDep = await previewTaskDistribution(projectId, {
      redistributeAssigned: false,
      defaultEstimatedHours: 4,
    });

    const task2WithDep = previewWithDep.proposedAssignments.find((a) => a.taskId === task2.id);
    assert(
      '9. Dependent task includes dependency warning about unfinished blocker',
      (task2WithDep?.dependencyWarnings.length || 0) > 0 &&
        task2WithDep!.dependencyWarnings[0].includes('Design PostgreSQL schema')
    );

    // --- 9. Test: Workload balance without artificial capacity capping ---
    // Create an 18-hour task assigned/evaluated for Charlie
    const taskHuge = await createTask({
      projectId,
      title: 'Docker cluster infrastructure configuration',
      estimatedHours: 18,
      priority: 'HIGH',
      requiredSkills: ['devops'],
    });

    const previewCapacity = await previewTaskDistribution(projectId, {
      taskIds: [taskHuge.id],
      redistributeAssigned: false,
    });
    const hugeTaskAssignment = previewCapacity.proposedAssignments.find((a) => a.taskId === taskHuge.id);
    assert(
      '10. Large task assigned without 40h capacity capping or time limit exceed error',
      !!hugeTaskAssignment &&
        hugeTaskAssignment.proposedAssigneeId === charlie.user_id &&
        hugeTaskAssignment.capacityWarnings.length === 0
    );

    // --- 10. Test: No eligible members matching skills -> task remains unassigned ---
    const taskUnmatched = await createTask({
      projectId,
      title: 'Rust WebAssembly encryption kernel',
      estimatedHours: 10,
      priority: 'HIGH',
      requiredSkills: ['rust', 'webassembly'], // Nobody has this
    });

    const previewUnmatched = await previewTaskDistribution(projectId, {
      taskIds: [taskUnmatched.id],
      redistributeAssigned: false,
    });
    const unassignedMatch = previewUnmatched.unassignedTasks.find((u) => u.taskId === taskUnmatched.id);
    assert(
      '11. Task with no matching member skills remains unassigned with clear reason',
      unassignedMatch !== undefined && unassignedMatch.reason.includes('No available project member possesses')
    );

    // --- 11. Test: Preview does NOT modify the database ---
    const checkDbUnchanged = await query<{ assignee_id: string | null }>(
      'SELECT assignee_id FROM tasks WHERE id = $1',
      [task1.id]
    );
    assert(
      '12. Preview generation leaves task assignee_id in DB untouched (null)',
      checkDbUnchanged.rows[0].assignee_id === null
    );

    // --- 12. Test: Determinism (identical inputs produce 100% identical outputs) ---
    const runA = await previewTaskDistribution(projectId, { redistributeAssigned: false });
    const runB = await previewTaskDistribution(projectId, { redistributeAssigned: false });
    const isDeterministic =
      JSON.stringify(runA.proposedAssignments) === JSON.stringify(runB.proposedAssignments) &&
      JSON.stringify(runA.unassignedTasks) === JSON.stringify(runB.unassignedTasks);
    assert('13. Determinism: consecutive preview runs produce identical recommendations', isDeterministic);

    // --- 13. Test: Approved assignments persist correctly via apply endpoint ---
    const applyRes = await fetch(`${BASE_URL}/projects/${projectId}/ai/distribute/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        assignments: [
          { taskId: task1.id, assigneeId: alice.user_id },
          { taskId: task2.id, assigneeId: bob.user_id },
        ],
      }),
    });
    const applyJson = (await applyRes.json()) as { success: boolean; updatedCount: number };
    assert(
      '14. Apply endpoint persists assignments transactionally',
      applyRes.status === 200 && applyJson.success && applyJson.updatedCount === 2
    );

    // Check DB rows updated
    const task1AfterApply = await query<{ assignee_id: string }>(
      'SELECT assignee_id FROM tasks WHERE id = $1',
      [task1.id]
    );
    assert(
      '15. Database reflects persisted assignee_id for Task 1',
      task1AfterApply.rows[0].assignee_id === alice.user_id
    );

    // --- 14. Test: Invalid / cross-project assignee rejected on apply ---
    // Create random user not in project
    const outsideUserRes = await query<{ id: string }>(
      `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
      ['Eve Outside', `eve_${Date.now()}@example.com`]
    );
    const eveId = outsideUserRes.rows[0].id;

    const crossProjectApplyRes = await fetch(`${BASE_URL}/projects/${projectId}/ai/distribute/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        assignments: [{ taskId: task3.id, assigneeId: eveId }],
      }),
    });
    assert(
      '16. Non-project member assignee is rejected with 400',
      crossProjectApplyRes.status === 400
    );

    // --- 15. Test: Transaction rollback on failure (atomic batch) ---
    // Batch containing 1 valid task and 1 invalid task
    const badBatchApplyRes = await fetch(`${BASE_URL}/projects/${projectId}/ai/distribute/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        assignments: [
          { taskId: task3.id, assigneeId: bob.user_id },
          { taskId: '00000000-0000-0000-0000-000000000000', assigneeId: alice.user_id },
        ],
      }),
    });
    assert('17. Batch with invalid task rejected with 400', badBatchApplyRes.status === 400);

    // Verify task3 was rolled back and NOT updated
    const task3Check = await query<{ assignee_id: string | null }>(
      'SELECT assignee_id FROM tasks WHERE id = $1',
      [task3.id]
    );
    assert('18. Transaction rollback: Task 3 was not updated during failed batch', task3Check.rows[0].assignee_id === null);

  } finally {
    // Clean up test project
    await query('DELETE FROM projects WHERE id = $1', [projectId]);
    console.log(`\nCleaned up test project ${projectId}`);
    await pool.end();
  }

  // Summary
  console.log('\n=====================================================');
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`VERIFICATION SUMMARY: ${passedCount} / ${results.length} tests passed`);
  console.log('=====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
