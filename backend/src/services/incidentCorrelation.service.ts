import { query } from '../db';
import {
  NormalizedMonitoringRecord,
  WorkflowRunRecord,
  IncidentRecord,
  FailureOccurrenceRecord,
  IngestionResult,
} from '../types/monitoring';
import { checkAndRecordWebhookDelivery } from './deduplicator.service';
import { publish } from './eventBus.service';
import { dispatchNotification } from './notification/dispatcher';
import { classifySeverity, classifyCategory, generateIncidentFingerprint } from './notificationPolicy';

// In-memory fallback stores for test and offline environments
const memoryWorkflowRuns = new Map<string, WorkflowRunRecord>();
const memoryIncidents = new Map<string, IncidentRecord>();
const memoryOccurrences: FailureOccurrenceRecord[] = [];

/**
 * Stage 4: Incident Correlation & Event Deduplication
 */

/**
 * Upserts a WorkflowRun record using stable provider identifiers
 * (provider, provider_run_id, run_attempt).
 */
export const upsertWorkflowRun = async (
  record: NormalizedMonitoringRecord
): Promise<WorkflowRunRecord> => {
  const runKey = `${record.provider}:${record.workflowRunId}:${record.runAttempt}`;

  try {
    const existing = await query<WorkflowRunRecord>(
      `SELECT * FROM workflow_runs
       WHERE provider = $1 AND provider_run_id = $2 AND run_attempt = $3;`,
      [record.provider, record.workflowRunId, record.runAttempt]
    );

    if (existing.rows.length > 0) {
      const updateResult = await query<WorkflowRunRecord>(
        `UPDATE workflow_runs
         SET status = $1, conclusion = $2, completed_at = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *;`,
        [
          record.status,
          record.conclusion,
          record.isFailure || record.isRecovery ? record.failureTimestamp : null,
          existing.rows[0].id,
        ]
      );
      return updateResult.rows[0];
    }

    const insertResult = await query<WorkflowRunRecord>(
      `INSERT INTO workflow_runs (
        provider, provider_run_id, run_attempt, repository_name, workflow_name,
        branch, commit_sha, html_url, commit_url, pr_number, pr_title, pr_url,
        status, conclusion, started_at, completed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING *;`,
      [
        record.provider,
        record.workflowRunId,
        record.runAttempt,
        record.repositoryName,
        record.workflowName,
        record.branch,
        record.commitSha,
        record.runUrl,
        record.commitUrl,
        record.associatedPullRequest?.number || null,
        record.associatedPullRequest?.title || null,
        record.associatedPullRequest?.url || null,
        record.status,
        record.conclusion,
        record.failureTimestamp,
        record.isFailure || record.isRecovery ? record.failureTimestamp : null,
      ]
    );

    return insertResult.rows[0];
  } catch (error: any) {
    // In-memory fallback
    if (
      error.code === 'ECONNREFUSED' ||
      error.code === '28P01' ||
      error.message?.includes('Database service') ||
      error.message?.includes('connect')
    ) {
      let run = memoryWorkflowRuns.get(runKey);
      if (run) {
        run = {
          ...run,
          status: record.status,
          conclusion: record.conclusion,
          updated_at: new Date().toISOString(),
        };
      } else {
        run = {
          id: `mem-run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          provider: record.provider,
          provider_run_id: record.workflowRunId,
          run_attempt: record.runAttempt,
          repository_name: record.repositoryName,
          workflow_name: record.workflowName,
          branch: record.branch,
          commit_sha: record.commitSha,
          html_url: record.runUrl,
          commit_url: record.commitUrl,
          pr_number: record.associatedPullRequest?.number || null,
          pr_title: record.associatedPullRequest?.title || null,
          pr_url: record.associatedPullRequest?.url || null,
          status: record.status,
          conclusion: record.conclusion,
          started_at: record.failureTimestamp,
          completed_at: record.failureTimestamp,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      memoryWorkflowRuns.set(runKey, run);
      return run;
    }
    throw error;
  }
};

/**
 * Correlates a normalized monitoring record into the incident model:
 * 1. Deduplicates raw delivery
 * 2. Upserts workflow run
 * 3. Correlates failures to existing active incidents (or creates a new one)
 * 4. Resolves/recovers active incidents when a successful rerun occurs
 */
export const correlateMonitoringRecord = async (
  record: NormalizedMonitoringRecord,
  rawPayload: Record<string, unknown>
): Promise<IngestionResult> => {
  // 1. Stage 4 Webhook Event Deduplication
  const deliveryCheck = await checkAndRecordWebhookDelivery(
    record.provider,
    record.deliveryId,
    record.eventType,
    record.action,
    rawPayload
  );

  if (deliveryCheck.isDuplicate) {
    return {
      isDuplicate: true,
      webhookEventId: deliveryCheck.eventRecord?.id,
      actionTaken: 'SKIPPED_DUPLICATE',
      normalizedRecord: record,
      message: `Delivery ${record.deliveryId} has already been processed. Skipping.`,
    };
  }

  // 2. Stage 4 Track Workflow Run
  const workflowRun = await upsertWorkflowRun(record);

  // Grouping Key for MVP Incident Model
  const incidentKey = `${record.provider}:${record.repositoryName}:${record.workflowName}:${record.branch || 'default'}`;

  // 3. Handle Failure Scenario
  if (record.isFailure) {
    let activeIncident: IncidentRecord | null = null;

    try {
      // Find active incident
      const incRes = await query<IncidentRecord>(
        `SELECT * FROM incidents
         WHERE incident_key = $1 AND status IN ('OPEN', 'INVESTIGATING')
         ORDER BY first_failure_at DESC
         LIMIT 1;`,
        [incidentKey]
      );
      activeIncident = incRes.rows[0] || null;

      if (activeIncident) {
        // Group with existing incident (Avoid duplicate incident for same failure)
        await query(
          `UPDATE incidents
           SET last_failure_at = $1,
               failure_count = failure_count + 1,
               latest_workflow_run_id = $2,
               updated_at = NOW()
           WHERE id = $3;`,
          [record.failureTimestamp, workflowRun.id, activeIncident.id]
        );

        const occRes = await query<FailureOccurrenceRecord>(
          `INSERT INTO failure_occurrences (
            incident_id, workflow_run_id, webhook_event_id, failed_job, failed_step,
            failure_timestamp, error_message, log_excerpt, run_url, commit_url, raw_details
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *;`,
          [
            activeIncident.id,
            workflowRun.id,
            deliveryCheck.eventRecord?.id || null,
            record.failedJob,
            record.failedStep,
            record.failureTimestamp,
            record.errorMessage,
            record.logExcerpt,
            record.runUrl,
            record.commitUrl,
            JSON.stringify(record.rawDetails),
          ]
        );

        publish('incident.updated', {
          incidentId: activeIncident.id,
          actionTaken: 'ATTACHED_TO_INCIDENT',
          repositoryName: record.repositoryName,
          workflowName: record.workflowName,
          branch: record.branch,
        });

        return {
          isDuplicate: false,
          webhookEventId: deliveryCheck.eventRecord?.id,
          actionTaken: 'ATTACHED_TO_INCIDENT',
          normalizedRecord: record,
          incidentId: activeIncident.id,
          occurrenceId: occRes.rows[0].id,
          workflowRunId: workflowRun.id,
          message: `Attached failure occurrence to existing active incident (${activeIncident.id}).`,
        };
      } else {

        // Create new incident
        const title = `${record.workflowName} failed on ${record.branch || 'default branch'}`;
        const incidentOwner = await resolveOwnerForRepository(record.repositoryName);
        const newIncRes = await query<IncidentRecord>(
          `INSERT INTO incidents (
            incident_key, title, repository_name, workflow_name, branch,
            status, first_failure_at, last_failure_at, latest_workflow_run_id, failure_count, owner_id
          ) VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7, $8, 1, $9)
          RETURNING *;`,
          [
            incidentKey,
            title,
            record.repositoryName,
            record.workflowName,
            record.branch,
            record.failureTimestamp,
            record.failureTimestamp,
            workflowRun.id,
            incidentOwner,
          ]
        );
        const newIncident = newIncRes.rows[0];

        const occRes = await query<FailureOccurrenceRecord>(
          `INSERT INTO failure_occurrences (
            incident_id, workflow_run_id, webhook_event_id, failed_job, failed_step,
            failure_timestamp, error_message, log_excerpt, run_url, commit_url, raw_details
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *;`,
          [
            newIncident.id,
            workflowRun.id,
            deliveryCheck.eventRecord?.id || null,
            record.failedJob,
            record.failedStep,
            record.failureTimestamp,
            record.errorMessage,
            record.logExcerpt,
            record.runUrl,
            record.commitUrl,
            JSON.stringify(record.rawDetails),
          ]
        );

        // Enrich with severity/category/fingerprint
        try {
          const category = classifyCategory({ source: 'ci', repository: record.repositoryName, errorMessage: record.errorMessage || newIncident.title });
          const severity = classifySeverity({ source: 'ci', repository: record.repositoryName, errorMessage: record.errorMessage || newIncident.title, category });
          const fingerprint = generateIncidentFingerprint({ source: 'ci', service: record.repositoryName, repository: record.repositoryName, errorSignature: incidentKey || newIncident.title });
          await query(`UPDATE incidents SET severity = $1, category = $2, fingerprint = $3, source = 'monitoring' WHERE id = $4`, [severity, category, fingerprint, newIncident.id]);
          (newIncident as any).severity = severity;
          (newIncident as any).category = category;
        } catch {}

        publish('incident.created', {
          incidentId: newIncident.id,
          actionTaken: 'CREATED_INCIDENT',
          repositoryName: record.repositoryName,
          workflowName: record.workflowName,
          branch: record.branch,
          title: newIncident.title,
        });
        
        // Update incident with run details
        try {
          await query(
            `UPDATE incidents SET run_url = $1, branch = $2, commit_sha = $3, job_name = $4, step_name = $5 
             WHERE id = $6`,
            [record.runUrl, record.branch, record.commitSha, record.failedJob, record.failedStep, newIncident.id]
          );
        } catch {}

        // Dispatch notification (critical/high sent without waiting for AI)
        try {
          const { dispatchNotificationEnhanced } = await import('./notification/dispatcherEnhanced');
          const { triggerAnalysis } = await import('./ai/rootCauseAnalysis.service');
          const { routeAndAssign } = await import('./assignment/teamAssignment.service');
          
          await dispatchNotificationEnhanced({
            incidentId: newIncident.id,
            title: newIncident.title,
            severity: (newIncident as any).severity || 'medium',
            category: (newIncident as any).category,
            service: record.repositoryName,
            environment: record.branch,
            repository: record.repositoryName,
            source: 'monitoring',
            status: newIncident.status,
            createdAt: newIncident.created_at,
            runUrl: record.runUrl,
            failedJob: record.failedJob,
            failedStep: record.failedStep,
            branch: record.branch,
            workflowName: record.workflowName
          });
          
          // Route and assign
          routeAndAssign(newIncident.id).catch(() => {});
          
          // Trigger AI analysis asynchronously (don't block)
          triggerAnalysis(newIncident.id);
        } catch (e) {
          console.error('Notification/analysis dispatch failed for incident:', (e as Error).message);
        }

        return {
          isDuplicate: false,
          webhookEventId: deliveryCheck.eventRecord?.id,
          actionTaken: 'CREATED_INCIDENT',
          normalizedRecord: record,
          incidentId: newIncident.id,
          occurrenceId: occRes.rows[0].id,
          workflowRunId: workflowRun.id,
          message: `Created new incident (${newIncident.id}) for failure on ${record.workflowName}.`,
        };
      }
    } catch (error: any) {
      // In-memory fallback handler
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === '28P01' ||
        error.message?.includes('Database service') ||
        error.message?.includes('connect')
      ) {
        const inc = Array.from(memoryIncidents.values()).find(
          (i) => i.incident_key === incidentKey && (i.status === 'OPEN' || i.status === 'INVESTIGATING')
        );

        if (inc) {
          inc.last_failure_at = record.failureTimestamp;
          inc.failure_count += 1;
          inc.latest_workflow_run_id = workflowRun.id;
          inc.updated_at = new Date().toISOString();

          const occ: FailureOccurrenceRecord = {
            id: `mem-occ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            incident_id: inc.id,
            workflow_run_id: workflowRun.id,
            webhook_event_id: deliveryCheck.eventRecord?.id || null,
            failed_job: record.failedJob,
            failed_step: record.failedStep,
            failure_timestamp: record.failureTimestamp,
            error_message: record.errorMessage,
            log_excerpt: record.logExcerpt,
            run_url: record.runUrl,
            commit_url: record.commitUrl,
            raw_details: record.rawDetails,
            created_at: new Date().toISOString(),
          };
          memoryOccurrences.push(occ);

          return {
            isDuplicate: false,
            webhookEventId: deliveryCheck.eventRecord?.id,
            actionTaken: 'ATTACHED_TO_INCIDENT',
            normalizedRecord: record,
            incidentId: inc.id,
            occurrenceId: occ.id,
            workflowRunId: workflowRun.id,
            message: `Attached failure occurrence to existing active incident (${inc.id}).`,
          };
        } else {
          const newInc: IncidentRecord = {
            id: `mem-inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            incident_key: incidentKey,
            title: `${record.workflowName} failed on ${record.branch || 'default branch'}`,
            repository_name: record.repositoryName,
            workflow_name: record.workflowName,
            branch: record.branch,
            status: 'OPEN',
            first_failure_at: record.failureTimestamp,
            last_failure_at: record.failureTimestamp,
            recovered_at: null,
            latest_workflow_run_id: workflowRun.id,
            recovery_workflow_run_id: null,
            failure_count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          memoryIncidents.set(newInc.id, newInc);

          const occ: FailureOccurrenceRecord = {
            id: `mem-occ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            incident_id: newInc.id,
            workflow_run_id: workflowRun.id,
            webhook_event_id: deliveryCheck.eventRecord?.id || null,
            failed_job: record.failedJob,
            failed_step: record.failedStep,
            failure_timestamp: record.failureTimestamp,
            error_message: record.errorMessage,
            log_excerpt: record.logExcerpt,
            run_url: record.runUrl,
            commit_url: record.commitUrl,
            raw_details: record.rawDetails,
            created_at: new Date().toISOString(),
          };
          memoryOccurrences.push(occ);

          return {
            isDuplicate: false,
            webhookEventId: deliveryCheck.eventRecord?.id,
            actionTaken: 'CREATED_INCIDENT',
            normalizedRecord: record,
            incidentId: newInc.id,
            occurrenceId: occ.id,
            workflowRunId: workflowRun.id,
            message: `Created new incident (${newInc.id}) for failure on ${record.workflowName}.`,
          };
        }
      }
      throw error;
    }
  }

  // 4. Handle Recovery / Successful Rerun Scenario
  if (record.isRecovery) {
    try {
      const activeIncRes = await query<IncidentRecord>(
        `SELECT * FROM incidents
         WHERE incident_key = $1 AND status IN ('OPEN', 'INVESTIGATING')
         ORDER BY first_failure_at DESC
         LIMIT 1;`,
        [incidentKey]
      );

      const activeIncident = activeIncRes.rows[0] || null;

      if (activeIncident) {
        // Transition incident to RECOVERED while preserving failure history
        await query(
          `UPDATE incidents
           SET status = 'RECOVERED',
               recovered_at = NOW(),
               recovery_workflow_run_id = $1,
               updated_at = NOW()
           WHERE id = $2;`,
          [workflowRun.id, activeIncident.id]
        );

        publish('incident.updated', {
          incidentId: activeIncident.id,
          actionTaken: 'RECOVERED_INCIDENT',
          status: 'RECOVERED',
          repositoryName: record.repositoryName,
          workflowName: record.workflowName,
        });

        return {
          isDuplicate: false,
          webhookEventId: deliveryCheck.eventRecord?.id,
          actionTaken: 'RECOVERED_INCIDENT',
          normalizedRecord: record,
          incidentId: activeIncident.id,
          workflowRunId: workflowRun.id,
          message: `Active incident (${activeIncident.id}) transitioned to RECOVERED following successful workflow rerun. History preserved.`,
        };
      }
    } catch (error: any) {
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === '28P01' ||
        error.message?.includes('Database service') ||
        error.message?.includes('connect')
      ) {
        const activeInc = Array.from(memoryIncidents.values()).find(
          (i) => i.incident_key === incidentKey && (i.status === 'OPEN' || i.status === 'INVESTIGATING')
        );

        if (activeInc) {
          activeInc.status = 'RECOVERED';
          activeInc.recovered_at = new Date().toISOString();
          activeInc.recovery_workflow_run_id = workflowRun.id;
          activeInc.updated_at = new Date().toISOString();

          return {
            isDuplicate: false,
            webhookEventId: deliveryCheck.eventRecord?.id,
            actionTaken: 'RECOVERED_INCIDENT',
            normalizedRecord: record,
            incidentId: activeInc.id,
            workflowRunId: workflowRun.id,
            message: `Active incident (${activeInc.id}) transitioned to RECOVERED following successful workflow rerun. History preserved.`,
          };
        }
      }
      throw error;
    }
  }

  // 5. Default non-failure event recorded
  return {
    isDuplicate: false,
    webhookEventId: deliveryCheck.eventRecord?.id,
    actionTaken: 'RECORDED_RUN_ONLY',
    normalizedRecord: record,
    workflowRunId: workflowRun.id,
    message: `Workflow run (${workflowRun.id}) recorded. No incident action required.`,
  };
};

/**
 * Resets memory state for testing
 */
export const resetMemoryStores = () => {
  memoryWorkflowRuns.clear();
  memoryIncidents.clear();
  memoryOccurrences.length = 0;
};

/**
 * Retrieves all incidents with optional filtering by status or repository.
 * Falls back gracefully to memory cache if the database is offline.
 */
/**
 * Resolves the account that owns the project monitoring a repository.
 *
 * Incidents are detected from real workflow runs, so the owner of the project
 * that links the repository is the account the incident belongs to.
 */
const resolveOwnerForRepository = async (repositoryName: string): Promise<string | null> => {
  try {
    const result = await query<{ owner_id: string | null }>(
      `SELECT owner_id FROM projects
       WHERE LOWER(repository) = LOWER($1) AND owner_id IS NOT NULL
       LIMIT 1;`,
      [repositoryName]
    );
    return result.rows[0]?.owner_id ?? null;
  } catch {
    return null;
  }
};

export const findIncidents = async (filters: {
  status?: string;
  repository?: string;
  ownerId?: string | null;
} = {}): Promise<IncidentRecord[]> => {
  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // Incidents without an owner stay shared with every account.
    if (filters.ownerId !== undefined) {
      conditions.push(`(owner_id = $${idx++} OR owner_id IS NULL)`);
      values.push(filters.ownerId);
    }

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status.toUpperCase());
    }

    if (filters.repository) {
      conditions.push(`repository_name ILIKE $${idx++}`);
      values.push(`%${filters.repository}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT id, incident_key, title, repository_name, workflow_name, branch,
             status, first_failure_at, last_failure_at, recovered_at,
             latest_workflow_run_id, recovery_workflow_run_id, failure_count,
             created_at, updated_at
      FROM incidents
      ${whereClause}
      ORDER BY last_failure_at DESC;
    `;
    const res = await query<IncidentRecord>(sql, values);
    return res.rows;
  } catch (error: any) {
    // Database offline fallback: query in-memory store
    let incidents = Array.from(memoryIncidents.values());

    if (filters.status) {
      const targetStatus = filters.status.toUpperCase();
      incidents = incidents.filter((i) => i.status === targetStatus);
    }

    if (filters.repository) {
      const targetRepo = filters.repository.toLowerCase();
      incidents = incidents.filter((i) => i.repository_name.toLowerCase().includes(targetRepo));
    }

    return incidents.sort(
      (a, b) => new Date(b.last_failure_at).getTime() - new Date(a.last_failure_at).getTime()
    );
  }
};

/**
 * Retrieves an incident along with its full failure occurrences history and workflow runs.
 */
export const findIncidentWithDetails = async (
  id: string,
  ownerId?: string | null
): Promise<{
  incident: IncidentRecord | null;
  latestRun: WorkflowRunRecord | null;
  recoveryRun: WorkflowRunRecord | null;
  occurrences: FailureOccurrenceRecord[];
}> => {
  try {
    const incRes = await query<IncidentRecord>(
      `SELECT * FROM incidents
       WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL);`,
      [id, ownerId ?? null]
    );

    if (incRes.rows.length === 0) {
      return { incident: null, latestRun: null, recoveryRun: null, occurrences: [] };
    }

    const incident = incRes.rows[0];

    const occRes = await query<FailureOccurrenceRecord>(
      `SELECT * FROM failure_occurrences WHERE incident_id = $1 ORDER BY failure_timestamp DESC;`,
      [id]
    );

    let latestRun: WorkflowRunRecord | null = null;
    if (incident.latest_workflow_run_id) {
      const runRes = await query<WorkflowRunRecord>(
        `SELECT * FROM workflow_runs WHERE id = $1;`,
        [incident.latest_workflow_run_id]
      );
      latestRun = runRes.rows[0] || null;
    }

    let recoveryRun: WorkflowRunRecord | null = null;
    if (incident.recovery_workflow_run_id) {
      const recRes = await query<WorkflowRunRecord>(
        `SELECT * FROM workflow_runs WHERE id = $1;`,
        [incident.recovery_workflow_run_id]
      );
      recoveryRun = recRes.rows[0] || null;
    }

    return {
      incident,
      latestRun,
      recoveryRun,
      occurrences: occRes.rows,
    };
  } catch (error: any) {
    // Memory fallback
    const incident = memoryIncidents.get(id) || null;
    if (!incident) {
      return { incident: null, latestRun: null, recoveryRun: null, occurrences: [] };
    }

    const occurrences = memoryOccurrences
      .filter((o) => o.incident_id === id)
      .sort((a, b) => new Date(b.failure_timestamp).getTime() - new Date(a.failure_timestamp).getTime());

    const latestRun = incident.latest_workflow_run_id
      ? Array.from(memoryWorkflowRuns.values()).find((r) => r.id === incident.latest_workflow_run_id) || null
      : null;

    const recoveryRun = incident.recovery_workflow_run_id
      ? Array.from(memoryWorkflowRuns.values()).find((r) => r.id === incident.recovery_workflow_run_id) || null
      : null;

    return {
      incident,
      latestRun,
      recoveryRun,
      occurrences,
    };
  }
};

/**
 * Marks an incident as manually resolved.
 *
 * This records a human decision only - it never fabricates workflow telemetry.
 * The failure history is preserved exactly as it was observed.
 */
export const resolveIncidentManually = async (
  incidentId: string,
  ownerId?: string | null
): Promise<IncidentRecord | null> => {
  const result = await query<IncidentRecord>(
    `UPDATE incidents
     SET status = 'RESOLVED',
         resolved_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND ($2::UUID IS NULL OR owner_id = $2 OR owner_id IS NULL)
     RETURNING *;`,
    [incidentId, ownerId ?? null]
  );

  const incident = result.rows[0] || null;
  if (incident) {
    publish('incident.resolved', {
      incidentId: incident.id,
      status: incident.status,
      repositoryName: incident.repository_name,
      workflowName: incident.workflow_name,
    });
  }
  return incident;
};
