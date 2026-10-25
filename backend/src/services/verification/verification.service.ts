import { query } from '../../db';
import { AppError } from '../../middleware/errorHandler';
import * as taskService from '../task.service';
import * as projectService from '../project.service';
import { fetchActivityCodeChanges, ActivityCodeDiff } from '../github.service';
import {
  AiVerificationOutput,
  ReviewDecision,
  TaskVerificationRecord,
} from './verification.types';
import { getVerificationProvider } from './verification.provider';

export interface TaskActivityRow {
  id: string;
  task_id: string;
  project_id: string;
  activity_type: 'COMMIT' | 'PULL_REQUEST';
  identifier: string;
  title: string;
  message_or_body: string | null;
  author_name: string | null;
  author_email: string | null;
  url: string;
  created_at: string;
}

/**
 * Validates whether AI cited files correspond to retrieved code changes.
 * Flags unanchored citations in limitations.
 */
function validateEvidenceAnchors(
  output: AiVerificationOutput,
  activityDiffs: ActivityCodeDiff[]
): { validatedOutput: AiVerificationOutput; anchorWarnings: string[] } {
  const actualFiles = new Set<string>();
  for (const act of activityDiffs) {
    for (const file of act.files) {
      actualFiles.add(file.filename.toLowerCase());
      if (file.previousFilename) {
        actualFiles.add(file.previousFilename.toLowerCase());
      }
    }
  }

  const anchorWarnings: string[] = [];

  // Inspect file citations
  for (const inspected of output.inspectedFiles) {
    if (actualFiles.size > 0 && !actualFiles.has(inspected.filePath.toLowerCase())) {
      anchorWarnings.push(
        `AI cited file '${inspected.filePath}' which was not found in the actual retrieved GitHub diff.`
      );
    }
  }

  if (anchorWarnings.length > 0) {
    output.gapsAndRisks.limitations = [
      ...output.gapsAndRisks.limitations,
      ...anchorWarnings,
    ];
  }

  return { validatedOutput: output, anchorWarnings };
}

/**
 * Runs end-to-end AI task verification:
 * 1. Checks task ownership and connected repository
 * 2. Prevents concurrent duplicate runs
 * 3. Retrieves task requirements (acceptance criteria or fallback to description)
 * 4. Retrieves associated GitHub commits and PRs
 * 5. Calls verification provider and validates with Zod
 * 6. Persists structured report to task_verifications
 * 7. Transitions task to IN_REVIEW if previously TODO or IN_PROGRESS
 */
export const verifyTask = async (
  taskId: string,
  userId?: string | null
): Promise<TaskVerificationRecord> => {
  // 1. Validate task existence
  const task = await taskService.findTaskById(taskId);
  if (!task) {
    throw new AppError(`Task ${taskId} not found`, 404);
  }

  // 2. Validate project & repository connection
  const project = await projectService.findProjectById(task.project_id);
  if (!project) {
    throw new AppError('Associated project not found', 404);
  }

  const repoRes = await query<{
    github_repo_owner: string | null;
    github_repo_name: string | null;
    github_connection_status: string | null;
  }>(
    `SELECT github_repo_owner, github_repo_name, github_connection_status
     FROM projects WHERE id = $1`,
    [task.project_id]
  );

  const repoData = repoRes.rows[0];
  const hasConnectedRepo =
    Boolean(repoData?.github_repo_owner && repoData?.github_repo_name) &&
    repoData?.github_connection_status === 'CONNECTED';

  // 3. Concurrency check: prevent overlapping runs for the same task
  const activeVerification = await query<{ id: string }>(
    `SELECT id FROM task_verifications
     WHERE task_id = $1 AND status = 'PENDING' AND created_at > NOW() - INTERVAL '2 minutes'`,
    [taskId]
  );

  if (activeVerification.rows.length > 0) {
    throw new AppError(
      'A verification is currently in progress for this task. Please wait for it to complete.',
      409
    );
  }

  // Store previous status for failure recovery and move task to IN_REVIEW upon submission
  const previousStatus = task.status;
  if (task.status !== 'IN_REVIEW') {
    await taskService.updateTask(taskId, { status: 'IN_REVIEW' }, { systemOverride: true });
  }

  // 4. Create initial PENDING record
  const initialInsert = await query<{ id: string }>(
    `INSERT INTO task_verifications (
       task_id, project_id, status, overall_verdict, summary, recommendation,
       triggered_by_user_id, created_at, updated_at
     ) VALUES ($1, $2, 'PENDING', 'INSUFFICIENT_EVIDENCE', 'Verification initiated...', 'Evaluating changes...', $3, NOW(), NOW())
     RETURNING id`,
    [taskId, task.project_id, userId || null]
  );
  const verificationId = initialInsert.rows[0].id;

  try {
    if (!hasConnectedRepo) {
      const summary =
        'No active GitHub repository is connected to this project. Connect a repository in Project Settings to enable AI verification.';
      await query(
        `UPDATE task_verifications
         SET status = 'COMPLETED',
             overall_verdict = 'INSUFFICIENT_EVIDENCE',
             summary = $1,
             recommendation = 'Connect a GitHub repository to the project to enable automated code verification.',
             confidence_score = 0.00,
             updated_at = NOW()
         WHERE id = $2`,
        [summary, verificationId]
      );
      await taskService.updateTask(taskId, { status: 'CHANGES_REQUESTED' }, { systemOverride: true });
      const res = await getVerificationById(verificationId);
      return res!;
    }

    // 5. Query task associated GitHub activities
    const activitiesRes = await query<TaskActivityRow>(
      `SELECT id, task_id, project_id, activity_type,
              github_identifier as identifier,
              title,
              body as message_or_body,
              author_github_username as author_name,
              NULL as author_email,
              github_url as url,
              created_at
       FROM task_github_activities
       WHERE task_id = $1
       ORDER BY created_at DESC`,
      [taskId]
    );

    const activities = activitiesRes.rows;

    if (activities.length === 0) {
      const summary = `No GitHub code activities found for task ORK-${task.task_number}. Push a commit or PR referencing ORK-${task.task_number} in the message.`;
      await query(
        `UPDATE task_verifications
         SET status = 'COMPLETED',
             overall_verdict = 'INSUFFICIENT_EVIDENCE',
             summary = $1,
             recommendation = 'Push commits with commit messages referencing the task key (e.g. "feat(ORK-${task.task_number}): ...") to enable code verification.',
             confidence_score = 0.00,
             updated_at = NOW()
         WHERE id = $2`,
        [summary, verificationId]
      );
      const res = await getVerificationById(verificationId);
      return res!;
    }

    // 6. Retrieve code changes for associated activities
    const diffs: ActivityCodeDiff[] = [];
    const limitations: string[] = [];
    const commitShas: string[] = [];
    const prNumbers: number[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalChanges = 0;
    let totalFiles = 0;

    for (const act of activities) {
      if (act.activity_type === 'COMMIT') {
        commitShas.push(act.identifier);
      } else if (act.activity_type === 'PULL_REQUEST') {
        const num = parseInt(act.identifier.replace(/\D/g, ''), 10);
        if (!isNaN(num)) prNumbers.push(num);
      }

      try {
        const activityDiff = await fetchActivityCodeChanges(
          repoData.github_repo_owner!,
          repoData.github_repo_name!,
          act.activity_type,
          act.identifier
        );
        diffs.push(activityDiff);
        limitations.push(...activityDiff.limitations);
        totalAdditions += activityDiff.stats.additions;
        totalDeletions += activityDiff.stats.deletions;
        totalChanges += activityDiff.stats.totalChanges;
        totalFiles += activityDiff.stats.totalFiles;
      } catch (diffErr) {
        console.warn(`Failed to fetch code diff for ${act.activity_type} ${act.identifier}:`, diffErr);
        limitations.push(
          `Could not fetch diff for ${act.activity_type} ${act.identifier}: ${diffErr instanceof Error ? diffErr.message : String(diffErr)}`
        );
      }
    }

    // 7. Determine criteria (structured or fallback to description)
    const acceptanceCriteria =
      task.acceptance_criteria && task.acceptance_criteria.length > 0
        ? task.acceptance_criteria
        : [];

    // 8. Call AI Verification Provider
    const provider = getVerificationProvider();
    const aiOutput = await provider.verifyCodeChanges({
      taskTitle: task.title,
      taskDescription: task.description || '',
      acceptanceCriteria,
      activityDiffs: diffs,
      knownLimitations: limitations,
    });

    // 9. Fact-check evidence citations
    const { validatedOutput } = validateEvidenceAnchors(aiOutput, diffs);

    const diffStats = {
      totalFiles,
      additions: totalAdditions,
      deletions: totalDeletions,
      totalChanges,
    };

    const limitationsText =
      validatedOutput.gapsAndRisks.limitations.length > 0
        ? validatedOutput.gapsAndRisks.limitations.join('; ')
        : null;

    // 10. Persist completed report
    await query(
      `UPDATE task_verifications
       SET status = 'COMPLETED',
           overall_verdict = $1,
           summary = $2,
           confidence_score = $3,
           recommendation = $4,
           requirements_coverage = $5,
           inspected_files = $6,
           gaps_and_risks = $7,
           limitations = $8,
           associated_commit_shas = $9,
           associated_pr_numbers = $10,
           diff_stats = $11,
           raw_error = NULL,
           updated_at = NOW()
       WHERE id = $12`,
      [
        validatedOutput.overallVerdict,
        validatedOutput.summary,
        validatedOutput.confidenceScore,
        validatedOutput.recommendation,
        JSON.stringify(validatedOutput.requirementsCoverage),
        JSON.stringify(validatedOutput.inspectedFiles),
        JSON.stringify(validatedOutput.gapsAndRisks),
        limitationsText,
        commitShas,
        prNumbers,
        JSON.stringify(diffStats),
        verificationId,
      ]
    );

    // 11. Workflow state mapping based on verification outcome
    // If verification identifies material unmet requirements or insufficient evidence, transition to CHANGES_REQUESTED
    const hasMissingRequirements =
      validatedOutput.overallVerdict === 'UNMET' ||
      validatedOutput.overallVerdict === 'PARTIALLY_SATISFIED' ||
      validatedOutput.overallVerdict === 'INSUFFICIENT_EVIDENCE' ||
      (validatedOutput.gapsAndRisks?.missingRequirements &&
        validatedOutput.gapsAndRisks.missingRequirements.length > 0) ||
      (validatedOutput.requirementsCoverage &&
        validatedOutput.requirementsCoverage.some(
          (r) => r.status === 'UNMET' || r.status === 'PARTIALLY_SATISFIED'
        ));

    if (hasMissingRequirements) {
      await taskService.updateTask(taskId, { status: 'CHANGES_REQUESTED' }, { systemOverride: true });
    } else {
      // Successful verification: task remains IN_REVIEW ("Ready for Approval")
      await taskService.updateTask(taskId, { status: 'IN_REVIEW' }, { systemOverride: true });
    }

    const completedRecord = await getVerificationById(verificationId);
    return completedRecord!;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Task verification failed for task ${taskId}:`, err);

    await query(
      `UPDATE task_verifications
       SET status = 'FAILED',
           overall_verdict = 'ERROR',
           summary = $1,
           recommendation = 'Resolve the verification error or retry verification.',
           raw_error = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [`Technical verification failure: ${errorMsg}`, errorMsg, verificationId]
    ).catch(() => {});

    // On technical failure (Gemini/GitHub unavailable), keep task out of DONE and restore previous status for retry
    if (previousStatus === 'IN_PROGRESS' || previousStatus === 'CHANGES_REQUESTED') {
      await taskService.updateTask(taskId, { status: previousStatus }, { systemOverride: true }).catch(() => {});
    }

    throw err;
  }
};

/**
 * Retrieves a verification record by ID with user names populated.
 */
export const getVerificationById = async (
  verificationId: string
): Promise<TaskVerificationRecord | null> => {
  const sql = `
    SELECT 
      v.id,
      v.task_id,
      v.project_id,
      v.status,
      v.overall_verdict,
      v.summary,
      v.confidence_score::float as confidence_score,
      v.requirements_coverage,
      v.inspected_files,
      v.gaps_and_risks,
      v.limitations,
      v.recommendation,
      COALESCE(v.associated_commit_shas, '{}') as associated_commit_shas,
      COALESCE(v.associated_pr_numbers, '{}') as associated_pr_numbers,
      v.diff_stats,
      v.raw_error,
      v.triggered_by_user_id,
      u1.name as triggered_by_name,
      v.reviewed_by_user_id,
      u2.name as reviewer_name,
      v.review_decision,
      v.review_feedback,
      v.reviewed_at,
      v.created_at,
      v.updated_at
    FROM task_verifications v
    LEFT JOIN users u1 ON v.triggered_by_user_id = u1.id
    LEFT JOIN users u2 ON v.reviewed_by_user_id = u2.id
    WHERE v.id = $1
  `;

  const res = await query<TaskVerificationRecord>(sql, [verificationId]);
  return res.rows[0] || null;
};

/**
 * Retrieves the latest verification report for a task and computes staleness.
 */
export const getLatestVerification = async (
  taskId: string
): Promise<TaskVerificationRecord | null> => {
  const sql = `
    SELECT 
      v.id,
      v.task_id,
      v.project_id,
      v.status,
      v.overall_verdict,
      v.summary,
      v.confidence_score::float as confidence_score,
      v.requirements_coverage,
      v.inspected_files,
      v.gaps_and_risks,
      v.limitations,
      v.recommendation,
      COALESCE(v.associated_commit_shas, '{}') as associated_commit_shas,
      COALESCE(v.associated_pr_numbers, '{}') as associated_pr_numbers,
      v.diff_stats,
      v.raw_error,
      v.triggered_by_user_id,
      u1.name as triggered_by_name,
      v.reviewed_by_user_id,
      u2.name as reviewer_name,
      v.review_decision,
      v.review_feedback,
      v.reviewed_at,
      v.created_at,
      v.updated_at
    FROM task_verifications v
    LEFT JOIN users u1 ON v.triggered_by_user_id = u1.id
    LEFT JOIN users u2 ON v.reviewed_by_user_id = u2.id
    WHERE v.task_id = $1
    ORDER BY v.created_at DESC
    LIMIT 1
  `;

  const res = await query<TaskVerificationRecord>(sql, [taskId]);
  if (res.rows.length === 0) return null;

  const record = res.rows[0];

  // Check staleness: are there activities created AFTER this verification?
  const newerActivities = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM task_github_activities
     WHERE task_id = $1 AND created_at > $2`,
    [taskId, record.created_at]
  );

  const hasNewer = parseInt(newerActivities.rows[0]?.count || '0', 10) > 0;
  record.is_stale = hasNewer;

  return record;
};

/**
 * Handles human reviewer decision (Approve or Request Changes).
 * Enforces stale verification safety and updates task status.
 */
export const submitReview = async (
  taskId: string,
  reviewerUserId: string,
  decision: ReviewDecision,
  feedback?: string | null,
  acknowledgeStale: boolean = false
): Promise<TaskVerificationRecord> => {
  const latestReport = await getLatestVerification(taskId);
  if (!latestReport) {
    throw new AppError('Cannot review task: No verification report exists.', 404);
  }

  if (latestReport.status !== 'COMPLETED') {
    throw new AppError('Cannot review task: Latest verification report did not complete.', 400);
  }

  // Stale report protection
  if (latestReport.is_stale && !acknowledgeStale) {
    throw new AppError(
      'New code changes have been pushed to this task since verification was performed. Please re-run verification or check "Acknowledge reviewing prior revision".',
      409
    );
  }

  // Update verification record with review decision
  await query(
    `UPDATE task_verifications
     SET review_decision = $1,
         reviewed_by_user_id = $2,
         review_feedback = $3,
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $4`,
    [decision, reviewerUserId, feedback || null, latestReport.id]
  );

  // Transition task status based on review decision
  if (decision === 'APPROVED') {
    await taskService.updateTask(taskId, { status: 'DONE' }, { systemOverride: true, isReviewApproval: true });
  } else if (decision === 'CHANGES_REQUESTED') {
    await taskService.updateTask(taskId, { status: 'CHANGES_REQUESTED' }, { systemOverride: true, isReviewApproval: true });
  }

  const updatedRecord = await getVerificationById(latestReport.id);
  return updatedRecord!;
};
