import { Router } from 'express';
import {
  getTask,
  updateTask,
  deleteTask,
  getTaskDependencies,
  createTaskDependency,
  deleteTaskDependency,
} from '../controllers/task.controller';

const router = Router();

// Single Task Operations
router.get('/:taskId', getTask);
router.patch('/:taskId', updateTask);
router.delete('/:taskId', deleteTask);

// Task Dependency Operations
router.get('/:taskId/dependencies', getTaskDependencies);
router.post('/:taskId/dependencies', createTaskDependency);
router.delete('/:taskId/dependencies/:dependsOnTaskId', deleteTaskDependency);

export default router;
