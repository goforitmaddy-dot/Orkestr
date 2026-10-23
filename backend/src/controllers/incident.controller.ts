import { Request, Response, NextFunction } from 'express';
import {
  findIncidents,
  findIncidentWithDetails,
  resolveIncidentManually,
} from '../services/incidentCorrelation.service';
import { AppError } from '../middleware/errorHandler';
import { query } from '../db';

/**
 * Incident Controller
 *
 * Read access and manual resolution for incidents detected by real CI runs.
 */
export const listIncidents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, repository } = req.query;

    const incidents = await findIncidents({
      status: typeof status === 'string' ? status : undefined,
      repository: typeof repository === 'string' ? repository : undefined,
      ownerId: req.user?.id ?? null,
    });

    res.status(200).json(incidents);
  } catch (error) {
    next(error);
  }
};

export const getIncidentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const details = await findIncidentWithDetails(id, req.user?.id ?? null);

    if (!details.incident) {
      throw new AppError(`Incident with ID ${id} not found`, 404);
    }

    // Fetch additional data
    const assignments = await query<any>(
      `SELECT * FROM incident_assignments WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [id]
    );
    const notifications = await query<any>(
      `SELECT * FROM notification_attempts WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    res.status(200).json({
      incident: details.incident,
      latestRun: details.latestRun,
      recoveryRun: details.recoveryRun,
      occurrences: details.occurrences,
      occurrencesCount: details.occurrences.length,
      assignments: assignments.rows,
      notifications: notifications.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marks an incident as resolved by a human.
 *
 * This only records the decision - the incident history stays exactly as it
 * was observed in CI.
 */
export const resolveIncident = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const incident = await resolveIncidentManually(id, req.user?.id ?? null);

    if (!incident) {
      throw new AppError(`Incident with ID ${id} not found`, 404);
    }

    res.status(200).json({
      success: true,
      data: incident,
      message: `Incident ${id} marked as resolved.`,
    });
  } catch (error) {
    next(error);
  }
};
