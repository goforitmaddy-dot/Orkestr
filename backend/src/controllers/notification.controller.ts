import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { dispatchNotification, acknowledgeIncident, escalateIncident } from '../services/notification/dispatcher';
import { isSlackConfigured } from '../services/notification/slack';
import { AppError } from '../middleware/errorHandler';

export const testNotification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { incidentId, channel } = req.body;
    
    if (!incidentId) {
      throw new AppError('incidentId is required', 400);
    }
    
    const result = await query<any>(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
    if (result.rows.length === 0) {
      throw new AppError('Incident not found', 404);
    }
    
    const incident = result.rows[0];
    const dispatchResult = await dispatchNotification({
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity || 'medium',
      category: incident.category,
      service: incident.repository_name,
      environment: incident.branch,
      repository: incident.repository_name,
      source: incident.source || 'manual',
      status: incident.status,
      createdAt: incident.created_at,
      aiInvestigationNote: incident.ai_investigation_note
    });
    
    res.json({
      success: true,
      data: dispatchResult,
      message: 'Notification dispatched'
    });
  } catch (error) {
    next(error);
  }
};

export const getNotificationAttempts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { incidentId, errorId } = req.params as any;
    
    let sql = 'SELECT * FROM notification_attempts WHERE 1=1';
    const params: any[] = [];
    
    if (incidentId) {
      params.push(incidentId);
      sql += ` AND incident_id = $${params.length}`;
    }
    if (errorId) {
      params.push(errorId);
      sql += ` AND application_error_id = $${params.length}`;
    }
    
    sql += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

export const acknowledgeIncidentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { incidentId } = req.params;
    const userId = (req as any).user?.id;
    
    if (!incidentId) {
      throw new AppError('incidentId is required', 400);
    }
    
    const success = await acknowledgeIncident(incidentId, userId);
    if (!success) {
      throw new AppError('Failed to acknowledge incident', 400);
    }
    
    res.json({ success: true, message: 'Incident acknowledged' });
  } catch (error) {
    next(error);
  }
};

export const escalateIncidentHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { incidentId } = req.params;
    const { reason } = req.body;
    
    if (!incidentId) {
      throw new AppError('incidentId is required', 400);
    }
    
    const success = await escalateIncident(incidentId, reason);
    if (!success) {
      throw new AppError('Failed to escalate incident', 400);
    }
    
    res.json({ success: true, message: 'Incident escalated' });
  } catch (error) {
    next(error);
  }
};

export const getNotificationStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const slackConfigured = isSlackConfigured();
    
    const rulesResult = await query('SELECT * FROM notification_rules WHERE enabled = TRUE ORDER BY priority DESC');
    const channelsResult = await query('SELECT * FROM notification_channels');
    
    res.json({
      success: true,
      data: {
        slack: {
          configured: slackConfigured
        },
        channels: channelsResult.rows,
        rules: rulesResult.rows,
        defaultEscalationTimeoutMinutes: parseInt(process.env.INCIDENT_ESCALATION_TIMEOUT_MINUTES || '30', 10)
      }
    });
  } catch (error) {
    next(error);
  }
};
