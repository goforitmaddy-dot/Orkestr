import { Router } from 'express';
import {
  testNotification,
  getNotificationAttempts,
  acknowledgeIncidentHandler,
  escalateIncidentHandler,
  getNotificationStatus
} from '../controllers/notification.controller';
import { requireAuth, optionalAuth } from '../middleware/auth';

const router = Router();

// Public-ish status
router.get('/status', getNotificationStatus);

// Acknowledge/Escalate (allow with or without auth for flexibility)
router.post('/incidents/:incidentId/acknowledge', optionalAuth, acknowledgeIncidentHandler);
router.post('/incidents/:incidentId/escalate', optionalAuth, escalateIncidentHandler);

// Attempts
router.get('/incidents/:incidentId/attempts', getNotificationAttempts);
router.get('/errors/:errorId/attempts', getNotificationAttempts);

// Test dispatch
router.post('/test', requireAuth, testNotification);

export default router;
