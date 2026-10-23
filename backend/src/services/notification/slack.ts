/**
 * Slack Notification Channel
 * Uses official Slack API, configured via env vars. Fails gracefully if unconfigured.
 * Never logs secrets.
 */
import { config } from '../../config/env';

export interface SlackMessage {
  channel?: string;
  text: string;
  blocks?: any[];
}

export interface SlackResult {
  ok: boolean;
  skipped: boolean;
  error?: string;
  ts?: string;
}

export const isSlackConfigured = (): boolean => {
  return !!(config.notifications.slackBotToken && config.notifications.slackDefaultChannel);
};

export const sendSlackMessage = async (message: SlackMessage): Promise<SlackResult> => {
  if (!isSlackConfigured()) {
    return { ok: false, skipped: true, error: 'Slack not configured' };
  }
  
  const channel = message.channel || config.notifications.slackDefaultChannel;
  
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.notifications.slackBotToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        text: message.text,
        blocks: message.blocks
      })
    });
    
    const data = await response.json() as any;
    
    if (!data.ok) {
      return { ok: false, skipped: false, error: data.error || 'Slack API error' };
    }
    
    return { ok: true, skipped: false, ts: data.ts };
  } catch (error: any) {
    return { ok: false, skipped: false, error: error.message || 'Network error' };
  }
};

export const formatIncidentMessage = (incident: {
  id: string;
  title: string;
  severity: string;
  service?: string | null;
  environment?: string | null;
  team_assigned?: string | null;
  status: string;
  investigation_status?: string | null;
  source?: string | null;
  created_at: string;
  repository_name?: string | null;
  ai_investigation_note?: string | null;
}): { text: string; blocks: any[] } => {
  const severityEmoji = incident.severity === 'critical' ? '🚨' : incident.severity === 'high' ? '⚠️' : '🔔';
  const dashboardUrl = config.notifications.incidentDashboardUrl 
    ? `${config.notifications.incidentDashboardUrl}/incidents/${incident.id}`
    : config.notifications.incidentDashboardUrl || '#';
  
  const text = `${severityEmoji} ${incident.severity.toUpperCase()}-SEVERITY INCIDENT\nIncident: ${incident.id}\nService: ${incident.service || incident.repository_name || 'unknown'}\nEnvironment: ${incident.environment || 'unknown'}\nError: ${incident.title}\nAssigned team: ${incident.team_assigned || 'On-call Engineering'}\nStatus: ${incident.investigation_status || incident.status}\nSource: ${incident.source || 'monitoring'}\nTime: ${incident.created_at}`;
  
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${severityEmoji} ${incident.severity.toUpperCase()}-SEVERITY INCIDENT` }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Incident:*\n${incident.id}` },
        { type: 'mrkdwn', text: `*Service:*\n${incident.service || incident.repository_name || 'unknown'}` },
        { type: 'mrkdwn', text: `*Environment:*\n${incident.environment || 'unknown'}` },
        { type: 'mrkdwn', text: `*Assigned team:*\n${incident.team_assigned || 'On-call Engineering'}` },
        { type: 'mrkdwn', text: `*Status:*\n${incident.investigation_status || incident.status}` },
        { type: 'mrkdwn', text: `*Source:*\n${incident.source || 'monitoring'}` }
      ]
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Error:*\n${incident.title}` }
    }
  ];
  
  if (incident.ai_investigation_note) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*AI investigation:*\n${incident.ai_investigation_note}` }
    });
  }
  
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*Action:*\n<${dashboardUrl}|Open incident dashboard>` }
  });
  
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Time: ${incident.created_at}` }] } as any);
  
  return { text, blocks };
};
