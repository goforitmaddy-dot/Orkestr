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

const router = Router();

// Project Endpoints
router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', getProject);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);

// Project Task Sub-Resource Endpoints
router.get('/:projectId/tasks', listProjectTasks);
router.post('/:projectId/tasks', createProjectTask);

export default router;
