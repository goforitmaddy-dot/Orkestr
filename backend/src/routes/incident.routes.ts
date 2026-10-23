import { Router } from 'express';
import {
  listIncidents,
  getIncidentById,
  resolveIncident,
} from '../controllers/incident.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', listIncidents);
router.get('/:id', getIncidentById);
router.post('/:id/resolve', resolveIncident);

export default router;
