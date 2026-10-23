import { Router } from 'express';
import {
  getIncidentDiagnosis,
  triggerIncidentDiagnosis,
  getAssignmentOptions,
  assignIncidentHandler,
  autoRouteIncident,
  getIncidentAssignments,
  getIncidentNotifications,
  retryIncidentNotification,
  dispatchIncidentNotification
} from '../controllers/incidentDiagnosis.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/:id/diagnosis', getIncidentDiagnosis);
router.post('/:id/diagnosis/trigger', triggerIncidentDiagnosis);
router.get('/assign/options', getAssignmentOptions);
router.post('/:id/assign', assignIncidentHandler);
router.post('/:id/route', autoRouteIncident);
router.get('/:id/assignments', getIncidentAssignments);
router.get('/:id/notifications', getIncidentNotifications);
router.post('/:id/notifications/:attemptId/retry', retryIncidentNotification);
router.post('/:id/notify', dispatchIncidentNotification);

export default router;
