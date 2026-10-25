import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from '../controllers/project.controller';
import {
  listProjectTasks,
  createProjectTask,
} from '../controllers/task.controller';
import {
  generatePlanHandler,
  applyPlanHandler,
} from '../controllers/ai.controller';
import {
  listProjectMembersHandler,
  addProjectMemberHandler,
  removeProjectMemberHandler,
} from '../controllers/member.controller';
import {
  previewDistributionHandler,
  applyDistributionHandler,
} from '../controllers/distribution.controller';
import {
  getProjectGitHubStatusHandler,
  connectProjectRepositoryHandler,
  disconnectProjectRepositoryHandler,
} from '../controllers/github.controller';
import {
  configureServerMonitoring,
  getServerHealth,
  ingestServerError,
  listServerErrorRecords,
  resolveServerErrorRecord,
} from '../controllers/serverMonitoring.controller';
import {
  requireAuth,
  requireProjectMember,
  requireProjectRole,
} from '../middleware/auth';

const router = Router();

// All project routes require a verified authenticated session
router.use(requireAuth);

// Project CRUD Endpoints
router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', requireProjectMember, getProject);
router.patch('/:id', requireProjectMember, requireProjectRole(['OWNER', 'ADMIN']), updateProject);
router.delete('/:id', requireProjectMember, requireProjectRole(['OWNER']), deleteProject);

// Project Task Sub-Resource Endpoints
router.get('/:projectId/tasks', requireProjectMember, listProjectTasks);
router.post(
  '/:projectId/tasks',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  createProjectTask
);

// Project Member Sub-Resource Endpoints
router.get('/:projectId/members', requireProjectMember, listProjectMembersHandler);
router.post(
  '/:projectId/members',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  addProjectMemberHandler
);
router.delete(
  '/:projectId/members/:userId',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  removeProjectMemberHandler
);

// AI Planning Endpoints (OWNER and ADMIN only)
router.post(
  '/:projectId/ai/plan',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  generatePlanHandler
);
router.post(
  '/:projectId/ai/plan/apply',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  applyPlanHandler
);

// Task Distribution Engine Endpoints (OWNER and ADMIN only)
router.post(
  '/:projectId/ai/distribute',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  previewDistributionHandler
);
router.post(
  '/:projectId/ai/distribute/apply',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  applyDistributionHandler
);

// GitHub Repository Integration Endpoints
router.get('/:projectId/github', requireProjectMember, getProjectGitHubStatusHandler);
router.post(
  '/:projectId/github/connect',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  connectProjectRepositoryHandler
);
router.delete(
  '/:projectId/github/disconnect',
  requireProjectMember,
  requireProjectRole(['OWNER', 'ADMIN']),
  disconnectProjectRepositoryHandler
);

/* Live server monitoring (project-scoped) */
router.post('/:id/server-monitoring', configureServerMonitoring);
router.get('/:id/server-health', getServerHealth);
router.post('/:id/server-errors', ingestServerError);
router.get('/:id/server-errors', listServerErrorRecords);
router.post('/:id/server-errors/:errorId/resolve', resolveServerErrorRecord);

export default router;
