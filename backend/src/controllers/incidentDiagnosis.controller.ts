import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { AppError } from '../middleware/errorHandler';
import { analyzeIncident, triggerAnalysis } from '../services/ai/rootCauseAnalysis.service';
import { routeAndAssign, assignIncident, getTeams, getTeamMembers, getAssignmentHistory } from '../services/assignment/teamAssignment.service';
import { retryNotification } from '../services/notification/dispatcherEnhanced';
import { dispatchNotificationEnhanced } from '../services/notification/dispatcherEnhanced';

export const getIncidentDiagnosis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await query<any>(
      `SELECT id, diagnosis_status, diagnosis_summary, diagnosis_likely_root_cause, 
              diagnosis_evidence, diagnosis_error_location, diagnosis_confidence,
              diagnosis_recommended_actions, diagnosis_related_files, diagnosis_limitations,
              diagnosis_analyzed_at
       FROM incidents WHERE id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new AppError('Incident not found', 404);
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

export const triggerIncidentDiagnosis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    triggerAnalysis(id);
    res.json({ success: true, message: 'Analysis triggered' });
  } catch (error) {
    next(error);
  }
};

export const getAssignmentOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teams = await getTeams();
    const members = await getTeamMembers();
    res.json({ success: true, data: { teams, members } });
  } catch (error) {
    next(error);
  }
};

export const assignIncidentHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { teamId, teamName, individualId, individualName } = req.body;
    const userId = (req as any).user?.id;
    
    const success = await assignIncident(id, teamId, teamName, individualId, individualName, 'Manual assignment', userId);
    if (!success) throw new AppError('Assignment failed', 400);
    
    res.json({ success: true, message: 'Incident assigned' });
  } catch (error) {
    next(error);
  }
};

export const autoRouteIncident = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await routeAndAssign(id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getIncidentAssignments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const history = await getAssignmentHistory(id);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
};

export const getIncidentNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await query<any>(
      `SELECT * FROM notification_attempts WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

export const retryIncidentNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, attemptId } = req.params;
    const success = await retryNotification(attemptId);
    if (!success) throw new AppError('Retry failed', 400);
    res.json({ success: true, message: 'Notification retried' });
  } catch (error) {
    next(error);
  }
};

export const dispatchIncidentNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const incidentRes = await query<any>(`SELECT * FROM incidents WHERE id = $1`, [id]);
    if (incidentRes.rows.length === 0) throw new AppError('Incident not found', 404);
    const incident = incidentRes.rows[0];
    
    const result = await dispatchNotificationEnhanced({
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity || 'medium',
      category: incident.category,
      repository: incident.repository_name,
      branch: incident.branch,
      workflowName: incident.workflow_name,
      teamAssigned: incident.team_assigned,
      diagnosisSummary: incident.diagnosis_summary,
      runUrl: incident.run_url
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
