import { Router, Request, Response } from 'express';
import {
  getMonitoringStatus,
  getMonitoringSummary,
  triggerPoll,
} from '../controllers/monitoring.controller';
import { subscribe } from '../services/eventBus.service';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * Server-Sent Events stream of live monitoring events.
 *
 * The browser subscribes with EventSource and receives an event whenever an
 * incident or runtime error is created, updated or resolved.
 */
router.get('/stream', (req: Request, res: Response) => {
  subscribe(res);
});

router.get('/status', getMonitoringStatus);
router.get('/summary', getMonitoringSummary);
router.post('/poll', triggerPoll);

export default router;
