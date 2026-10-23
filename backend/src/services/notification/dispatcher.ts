/**
 * Notification Dispatcher
 * Orchestrates routing, deduplication, delivery across channels
 * Never blocks on AI, dispatches critical alerts immediately
 */
import { query } from '../../db';
import { publish } from '../eventBus.service';
import { routeToTeam } from './router';
import { sendSlackMessage, formatIncidentMessage, isSlackConfigured } from './slack';
import { sanitizeForNotification } from '../notificationPolicy';

export interface DispatchInput {
  incidentId?: string;
  applicationErrorId?: string;
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
}

export const dispatchNotification = async (input: DispatchInput): Promise<{
  success: boolean;
  teamAssigned?: string;
  channelsAttempted: string[];
  results: any[];
}> => {
  const routing = await routeToTeam({
    service: input.service,
    environment: input.environment,
    category: input.category,
    severity: input.severity,
    repository: input.repository
  });
  
  const teamAssigned = routing.team;
  const channels = routing.channels || ['slack'];
  const results: any[] = [];
  
  // Update incident/error with routing info
  try {
    if (input.incidentId) {
      await query(
        `UPDATE incidents SET team_assigned = $1, last_notified_at = NOW(), notification_status = 'queued' WHERE id = $2`,
        [teamAssigned, input.incidentId]
      );
    } else if (input.applicationErrorId) {
      await query(
        `UPDATE application_errors SET team_assigned = $1, last_notified_at = NOW() WHERE id = $2`,
        [teamAssigned, input.applicationErrorId]
      );
    }
  } catch {}
  
  // Publish in-app event via SSE
  try {
    publish('incident.updated', {
      incidentId: input.incidentId,
      applicationErrorId: input.applicationErrorId,
      type: 'notification',
      teamAssigned,
      severity: input.severity,
      status: 'notified',
      message: `Incident notified to ${teamAssigned}`
    });
  } catch {}
  
  // Dispatch to each channel
  for (const channel of channels) {
    if (channel === 'slack') {
      if (!isSlackConfigured()) {
        await query(
          `INSERT INTO notification_attempts (incident_id, application_error_id, channel, status, provider, error_message, created_at)
           VALUES ($1, $2, 'slack', 'skipped', 'slack', 'Not configured', NOW())`,
          [input.incidentId || null, input.applicationErrorId || null]
        );
        results.push({ channel: 'slack', status: 'skipped', reason: 'unconfigured' });
        continue;
      }
      
      const { text, blocks } = formatIncidentMessage({
        id: input.incidentId || input.applicationErrorId || 'unknown',
        title: sanitizeForNotification(input.title),
        severity: input.severity,
        service: input.service,
        environment: input.environment,
        team_assigned: teamAssigned,
        status: input.status || 'OPEN',
        investigation_status: 'Investigating',
        source: input.source || 'monitoring',
        created_at: input.createdAt || new Date().toISOString(),
        repository_name: input.repository,
        ai_investigation_note: input.aiInvestigationNote ? sanitizeForNotification(input.aiInvestigationNote) : null
      });
      
      const slackResult = await sendSlackMessage({ text, blocks });
      
      await query(
        `INSERT INTO notification_attempts (incident_id, application_error_id, channel, status, provider, provider_response, sent_at, created_at)
         VALUES ($1, $2, 'slack', $3, 'slack', $4, $5, NOW())`,
        [
          input.incidentId || null,
          input.applicationErrorId || null,
          slackResult.ok ? 'sent' : slackResult.skipped ? 'skipped' : 'failed',
          JSON.stringify({ ok: slackResult.ok, ts: slackResult.ts, error: slackResult.error }),
          slackResult.ok ? new Date().toISOString() : null
        ]
      );
      
      results.push({ channel: 'slack', ...slackResult });
    } else if (channel === 'in_app') {
      results.push({ channel: 'in_app', status: 'sent' });
    } else if (channel === 'email') {
      await query(
        `INSERT INTO notification_attempts (incident_id, application_error_id, channel, status, provider, error_message, created_at)
         VALUES ($1, $2, 'email', 'skipped', 'email', 'Email not configured', NOW())`,
        [input.incidentId || null, input.applicationErrorId || null]
      );
      results.push({ channel: 'email', status: 'skipped', reason: 'unconfigured' });
    }
  }
  
  // Update notification status
  try {
    if (input.incidentId) {
      const hasSent = results.some(r => r.status === 'sent');
      const hasSkipped = results.every(r => r.status === 'skipped');
      const status = hasSent ? 'sent' : hasSkipped ? 'skipped' : 'failed';
      await query(`UPDATE incidents SET notification_status = $1 WHERE id = $2`, [status, input.incidentId]);
    }
  } catch {}
  
  return {
    success: results.some(r => r.ok === true || r.status === 'sent'),
    teamAssigned,
    channelsAttempted: channels,
    results
  };
};

export const acknowledgeIncident = async (incidentId: string, userId?: string): Promise<boolean> => {
  try {
    await query(
      `UPDATE incidents SET acknowledged_at = NOW(), acknowledged_by = $2, notification_status = 'acknowledged', investigation_status = 'Investigating'
       WHERE id = $1 AND acknowledged_at IS NULL`,
      [incidentId, userId || null]
    );
    publish('incident.updated', { incidentId, type: 'acknowledged', acknowledgedAt: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
};

export const escalateIncident = async (incidentId: string, reason?: string): Promise<boolean> => {
  try {
    const res = await query<any>(`SELECT team_assigned, escalation_level FROM incidents WHERE id = $1`, [incidentId]);
    const currentTeam = res.rows[0]?.team_assigned || 'On-call Engineering';
    const level = (res.rows[0]?.escalation_level || 0) + 1;
    const nextTeam = level >= 2 ? 'Engineering Leadership' : 'SRE / Platform On-call';
    
    await query(
      `UPDATE incidents SET team_assigned = $1, escalated_at = NOW(), escalation_level = $2 WHERE id = $3`,
      [nextTeam, level, incidentId]
    );
    await query(
      `INSERT INTO incident_escalations (incident_id, from_team, to_team, level, reason, escalated_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [incidentId, currentTeam, nextTeam, level, reason || 'Escalation timeout / policy']
    );
    publish('incident.updated', { incidentId, type: 'escalated', fromTeam: currentTeam, toTeam: nextTeam, level });
    return true;
  } catch {
    return false;
  }
};
