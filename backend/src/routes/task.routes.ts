import { Router } from 'express';
import {
  getTask,
  updateTask,
  deleteTask,
  getTaskDependencies,
  createTaskDependency,
  deleteTaskDependency,
  getTaskGitHubActivities,
  verifyTaskHandler,
  getTaskVerificationHandler,
  reviewTaskVerificationHandler,
} from '../controllers/task.controller';
import { requireAuth, requireTaskAccess } from '../middleware/auth.middleware';

const router = Router();

// All task routes require a verified authenticated session
router.use(requireAuth);

// Single Task Operations
router.get('/:taskId', requireTaskAccess('read'), getTask);
router.patch('/:taskId', requireTaskAccess('update'), updateTask);
router.delete('/:taskId', requireTaskAccess('delete'), deleteTask);

// Task Dependency Operations
router.get('/:taskId/dependencies', requireTaskAccess('read'), getTaskDependencies);
router.post('/:taskId/dependencies', requireTaskAccess('dependency'), createTaskDependency);
router.delete(
  '/:taskId/dependencies/:dependsOnTaskId',
  requireTaskAccess('dependency'),
  deleteTaskDependency
);

// Task GitHub Activity Operations
router.get('/:taskId/github-activities', requireTaskAccess('read'), getTaskGitHubActivities);

// AI Task Verification & Review Operations
router.post('/:taskId/verify', requireTaskAccess('read'), verifyTaskHandler);
router.get('/:taskId/verification', requireTaskAccess('read'), getTaskVerificationHandler);
router.post('/:taskId/review', requireTaskAccess('review'), reviewTaskVerificationHandler);

export default router;
