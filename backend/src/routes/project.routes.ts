import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/project.controller';
import {
  configureServerMonitoring,
  getServerHealth,
  ingestServerError,
  listServerErrorRecords,
  resolveServerErrorRecord,
} from '../controllers/serverMonitoring.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', getProject);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);

/* Live server monitoring (project-scoped) */
router.post('/:id/server-monitoring', configureServerMonitoring);
router.get('/:id/server-health', getServerHealth);
router.post('/:id/server-errors', ingestServerError);
router.get('/:id/server-errors', listServerErrorRecords);
router.post('/:id/server-errors/:errorId/resolve', resolveServerErrorRecord);

export default router;
