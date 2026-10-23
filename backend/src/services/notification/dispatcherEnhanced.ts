/**
 * Enhanced Notification Dispatcher
 * Tracks delivery, supports retries, never blocks on AI
 */

import { query } from '../../db';
import { publish } from '../eventBus.service';
import { routeAndAssign } from '../assignment/teamAssignment.service';
import { sendSlackMessage, formatIncidentMessage, isSlackConfigured } from './slack';
import { sanitizeForNotification } from '../notificationPolicy';

export interface DispatchInput {
  incidentId: string;
  title: string;
  severity: string;
  category?: string | null;
  service?: string | null;
  environment?: string | null;
  repository?: string | null;
  source?: string;
  status?: string;
  createdAt?: string;
  aiInvestigationNote?: string | null;
  runUrl?: string | null;
  failedJob?: string | null;
  failedStep?: string | null;
  branch?: string | null;
  workflowName?: string | null;
  diagnosisSummary?: string | null;
  teamAssigned?: string | null;
  assignedIndividual?: string | null;
}

export const dispatchNotificationEnhanced = async (input: DispatchInput): Promise<{
  success: boolean;
  teamAssigned?: string;
  channelsAttempted: string[];
  results: any[];
}> => {
  try {
    // Route and assign if not already assigned
    let assignment = { teamName: input.teamAssigned };
    if (!input.teamAssigned) {
      const routeResult = await routeAndAssign(input.incidentId);
      assignment.teamName = routeResult.teamName;
    }
    
    const teamAssigned = assignment.teamName || 'On-call Engineering';
    const channels = ['slack', 'in_app'];
    const results: any[] = [];
    
    // Update incident
    try {
      await query(
        `UPDATE incidents SET team_assigned = $1, last_notified_at = NOW(), notification_status = 'queued' WHERE id = $2`,
        [teamAssigned, input.incidentId]
      );
    } catch {}
    
    // Publish in-app event
    try {
      publish('incident.updated', {
        incidentId: input.incidentId,
        type: 'notification',
        teamAssigned,
        severity: input.severity,
        status: 'notified',
        message: `Incident notified to ${teamAssigned}`
      });
    } catch {}
    
    // Slack notification
    if (channels.includes('slack')) {
      if (!isSlackConfigured()) {
        await query(
          `INSERT INTO notification_attempts (incident_id, channel, status, provider, error_message, recipient, attempt_count, created_at, last_attempt_at)
           VALUES ($1, 'slack', 'skipped', 'slack', 'Slack not configured', $2, 1, NOW(), NOW())`,
          [input.incidentId, teamAssigned]
        );
        results.push({ channel: 'slack', status: 'skipped', reason: 'unconfigured' });
      } else {
        const text = formatEnhancedMessage(input, teamAssigned);
        const blocks = formatEnhancedBlocks(input, teamAssigned);
        
        try {
          const slackResult = await sendSlackMessage({ text, blocks });
          
          await query(
            `INSERT INTO notification_attempts (incident_id, channel, status, provider, provider_response, sent_at, recipient, attempt_count, created_at, last_attempt_at)
             VALUES ($1, 'slack', $2, 'slack', $3, $4, $5, 1, NOW(), NOW())`,
            [
              input.incidentId,
              slackResult.ok ? 'sent' : 'failed',
              JSON.stringify({ ok: slackResult.ok, ts: slackResult.ts, error: slackResult.error }),
              slackResult.ok ? new Date().toISOString() : null,
              teamAssigned
            ]
          );
          
          results.push({ channel: 'slack', ...slackResult, status: slackResult.ok ? 'sent' : 'failed' });
        } catch (err: any) {
          await query(
            `INSERT INTO notification_attempts (incident_id, channel, status, provider, error_message, recipient, attempt_count, created_at, last_attempt_at)
             VALUES ($1, 'slack', 'failed', 'slack', $2, $3, 1, NOW(), NOW())`,
            [input.incidentId, sanitizeForNotification(err.message), teamAssigned]
          );
          results.push({ channel: 'slack', status: 'failed', error: err.message });
        }
      }
    }
    
    // In-app notification
    if (channels.includes('in_app')) {
      await query(
        `INSERT INTO notification_attempts (incident_id, channel, status, provider, sent_at, recipient, attempt_count, created_at, last_attempt_at)
         VALUES ($1, 'in_app', 'sent', 'in_app', NOW(), $2, 1, NOW(), NOW())`,
        [input.incidentId, teamAssigned]
      );
      results.push({ channel: 'in_app', status: 'sent' });
    }
    
    // Update status
    try {
      const hasSent = results.some(r => r.status === 'sent' && r.ok !== false);
      const hasSkipped = results.every(r => r.status === 'skipped');
      const status = hasSent ? 'sent' : hasSkipped ? 'skipped' : 'failed';
      await query(`UPDATE incidents SET notification_status = $1 WHERE id = $2`, [status, input.incidentId]);
    } catch {}
    
    return {
      success: results.some(r => r.status === 'sent'),
      teamAssigned,
      channelsAttempted: channels,
      results
    };
  } catch (error) {
    console.error('Enhanced dispatch failed:', (error as Error).message);
    return {
      success: false,
      teamAssigned: 'On-call Engineering',
      channelsAttempted: [],
      results: [{ status: 'failed', error: (error as Error).message }]
    };
  }
};

function formatEnhancedMessage(input: DispatchInput, teamAssigned: string): string {
  const severityEmoji = input.severity === 'critical' ? '🚨' : input.severity === 'high' ? '⚠️' : '🔔';
  const parts = [
    `${severityEmoji} [${input.severity.toUpperCase()}] GitHub Actions workflow failed`,
    `Repository: ${input.repository || 'unknown'}`,
    `Branch: ${input.branch || 'unknown'}`,
    `Workflow: ${input.workflowName || input.title}`,
  ];
  if (input.failedJob) parts.push(`Failed job: ${input.failedJob}`);
  if (input.failedStep) parts.push(`Failed step: ${input.failedStep}`);
  if (input.diagnosisSummary) parts.push(`Summary: ${input.diagnosisSummary}`);
  parts.push(`Assigned team: ${teamAssigned}`);
  if (input.assignedIndividual) parts.push(`Assigned to: ${input.assignedIndividual}`);
  if (input.runUrl) parts.push(`GitHub Actions run: ${input.runUrl}`);
  return parts.join('\n');
}

function formatEnhancedBlocks(input: DispatchInput, teamAssigned: string): any[] {
  const severityEmoji = input.severity === 'critical' ? '🚨' : input.severity === 'high' ? '⚠️' : '🔔';
  const dashboardUrl = process.env.INCIDENT_DASHBOARD_URL || 'http://localhost:3000';
  
  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${severityEmoji} [${input.severity.toUpperCase()}] GitHub Actions workflow failed` }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Repository:*\n${input.repository || 'unknown'}` },
        { type: 'mrkdwn', text: `*Branch:*\n${input.branch || 'unknown'}` },
        { type: 'mrkdwn', text: `*Workflow:*\n${input.workflowName || input.title}` },
        { type: 'mrkdwn', text: `*Assigned team:*\n${teamAssigned}` }
      ]
    }
  ];
  
  if (input.failedJob || input.failedStep) {
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Failed job:*\n${input.failedJob || 'N/A'}` },
        { type: 'mrkdwn', text: `*Failed step:*\n${input.failedStep || 'N/A'}` }
      ]
    });
  }
  
  if (input.diagnosisSummary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Summary:*\n${sanitizeForNotification(input.diagnosisSummary)}` }
    });
  }
  
  if (input.assignedIndividual) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Assigned to:*\n${input.assignedIndividual}` }
    });
  }
  
  blocks.push({
    type: 'section',
    text: { 
      type: 'mrkdwn', 
      text: `*Links:*\n• <${dashboardUrl}/monitor|Orkestr incident: ${input.incidentId}>\n${input.runUrl ? `• <${input.runUrl}|GitHub Actions run>` : ''}` 
    }
  });
  
  return blocks;
}

export const retryNotification = async (attemptId: string): Promise<boolean> => {
  try {
    const attemptRes = await query<any>(`SELECT * FROM notification_attempts WHERE id = $1`, [attemptId]);
    if (attemptRes.rows.length === 0) return false;
    
    const attempt = attemptRes.rows[0];
    if (attempt.status !== 'failed') return false;
    
    // Mark as retrying
    await query(
      `UPDATE notification_attempts SET status = 'retrying', attempt_count = attempt_count + 1, last_attempt_at = NOW() WHERE id = $1`,
      [attemptId]
    );
    
    // Get incident details
    const incidentRes = await query<any>(`SELECT * FROM incidents WHERE id = $1`, [attempt.incident_id]);
    if (incidentRes.rows.length === 0) return false;
    const incident = incidentRes.rows[0];
    
    // Retry dispatch
    const result = await dispatchNotificationEnhanced({
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity || 'medium',
      category: incident.category,
      repository: incident.repository_name,
      branch: incident.branch,
      workflowName: incident.workflow_name,
      teamAssigned: incident.team_assigned,
      diagnosisSummary: incident.diagnosis_summary
    });
    
    return result.success;
  } catch (error) {
    console.error('Retry failed:', (error as Error).message);
    return false;
  }
};
